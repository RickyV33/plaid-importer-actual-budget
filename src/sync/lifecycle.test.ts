import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-importer-test-"));
const dbPath = path.join(tmpDir, "test.db");

process.env.APP_URL ??= "http://localhost:8080";
process.env.APP_USER ??= "test";
process.env.APP_PASSWORD ??= "test";
process.env.SESSION_SECRET ??= "x".repeat(32);
process.env.PLAID_CLIENT_ID ??= "test";
process.env.PLAID_SECRET ??= "test";
process.env.ACTUAL_SERVER_URL ??= "http://localhost:5006";
process.env.ACTUAL_SERVER_PASSWORD ??= "test";
process.env.ACTUAL_SYNC_ID ??= "test";
process.env.TOKEN_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString("base64");
process.env.DATABASE_PATH = dbPath;
process.env.ACTUAL_CACHE_DIR = path.join(tmpDir, "actual-cache");

const {
  buildImportedIdMapFromTxns,
  processRemovals,
  shouldImportTxn,
} = await import("./lifecycle.js");
const { runMigrations } = await import("../db/migrate.js");
const { syncOrphanDeletes, syncRuns } = await import("../db/queries.js");

runMigrations();

test("shouldImportTxn: skips pending when mapping.pending_visible=false", () => {
  const mapping = { pending_visible: 0 };
  assert.equal(shouldImportTxn(mapping, { pending: true }), false);
  assert.equal(shouldImportTxn(mapping, { pending: false }), true);
});

test("shouldImportTxn: includes pending when mapping.pending_visible=true", () => {
  const mapping = { pending_visible: 1 };
  assert.equal(shouldImportTxn(mapping, { pending: true }), true);
  assert.equal(shouldImportTxn(mapping, { pending: false }), true);
});

test("shouldImportTxn: returns false when no mapping", () => {
  assert.equal(shouldImportTxn(undefined, { pending: false }), false);
  assert.equal(shouldImportTxn(undefined, { pending: true }), false);
});

test("buildImportedIdMapFromTxns: skips rows without imported_id, indexes the rest", () => {
  const txns = [
    { id: "actual-1", imported_id: "P1", payee: "Costco", amount: -12000, date: "2026-05-10" },
    { id: "actual-2", payee: "Manual entry", amount: -500, date: "2026-05-11" },
    { id: "actual-3", imported_id: "P2", payee: null, amount: -3000, date: "2026-05-12" },
  ];
  const map = buildImportedIdMapFromTxns(txns);
  assert.equal(map.size, 2);
  assert.deepEqual(map.get("P1"), {
    id: "actual-1",
    payee: "Costco",
    amount: -12000,
    date: "2026-05-10",
  });
  assert.deepEqual(map.get("P2"), {
    id: "actual-3",
    payee: null,
    amount: -3000,
    date: "2026-05-12",
  });
  assert.equal(map.get("does-not-exist"), undefined);
});

test("processRemovals: missing-in-map removal logs warn and does NOT insert orphan", async () => {
  const runId = syncRuns.start({ triggeredBy: "manual", scope: "all" });
  const warns: Array<{ obj: object; msg?: string }> = [];
  const log = { warn: (obj: object, msg?: string) => warns.push({ obj, msg }) };

  const fakeApi = {
    getTransactions: async () => [], // empty Actual → nothing in map
    deleteTransaction: async () => {
      throw new Error("should not be called");
    },
  };

  const before = syncOrphanDeletes.countUnacknowledged();

  await processRemovals(
    fakeApi as never,
    runId,
    "actual-acct-1",
    [
      {
        plaidTransactionId: "P-missing",
        plaidAccountId: "plaid-acct-1",
        actualAccountId: "actual-acct-1",
        plaidItemId: "item-1",
      },
    ],
    log,
  );

  syncRuns.finish({ id: runId, status: "success", totalImported: 0 });

  assert.equal(warns.length, 1, "expected exactly one warn");
  assert.equal(warns[0]?.msg, "remove: no matching Actual txn");
  assert.equal(syncOrphanDeletes.countUnacknowledged(), before, "no orphan inserted");
});

test("processRemovals: failed deleteTransaction inserts a sync_orphan_deletes row", async () => {
  const runId = syncRuns.start({ triggeredBy: "manual", scope: "all" });
  const log = { warn: () => {} };

  const fakeApi = {
    getTransactions: async () => [
      { id: "actual-99", imported_id: "P-explode", payee: "Acme", amount: -4200, date: "2026-05-15" },
    ],
    deleteTransaction: async () => {
      throw new Error("boom");
    },
  };

  const before = syncOrphanDeletes.countUnacknowledged();

  await processRemovals(
    fakeApi as never,
    runId,
    "actual-acct-2",
    [
      {
        plaidTransactionId: "P-explode",
        plaidAccountId: "plaid-acct-2",
        actualAccountId: "actual-acct-2",
        plaidItemId: "item-2",
      },
    ],
    log,
  );

  syncRuns.finish({ id: runId, status: "failure", totalImported: 0 });

  const after = syncOrphanDeletes.countUnacknowledged();
  assert.equal(after, before + 1);

  const orphans = syncOrphanDeletes.listUnacknowledged();
  const newest = orphans.find((o) => o.plaid_transaction_id === "P-explode");
  assert.ok(newest, "orphan row inserted");
  assert.equal(newest!.payee_name, "Acme");
  assert.equal(newest!.amount_cents, -4200);
  assert.equal(newest!.date, "2026-05-15");
  assert.match(newest!.error_reason, /^delete_failed: boom/);
});

test("processRemovals: successful delete inserts no orphan", async () => {
  const runId = syncRuns.start({ triggeredBy: "manual", scope: "all" });
  const log = { warn: () => {} };

  let deleted: string | undefined;
  const fakeApi = {
    getTransactions: async () => [
      { id: "actual-ok", imported_id: "P-ok", payee: "Ok", amount: -100, date: "2026-05-16" },
    ],
    deleteTransaction: async (id: string) => {
      deleted = id;
      return [] as never;
    },
  };

  const before = syncOrphanDeletes.countUnacknowledged();

  await processRemovals(
    fakeApi as never,
    runId,
    "actual-acct-3",
    [
      {
        plaidTransactionId: "P-ok",
        plaidAccountId: "plaid-acct-3",
        actualAccountId: "actual-acct-3",
        plaidItemId: "item-3",
      },
    ],
    log,
  );

  syncRuns.finish({ id: runId, status: "success", totalImported: 0 });

  assert.equal(deleted, "actual-ok");
  assert.equal(syncOrphanDeletes.countUnacknowledged(), before);
});
