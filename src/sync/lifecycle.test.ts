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
  bucketDelta,
  processPromotions,
  processRemovals,
  shouldImportTxn,
} = await import("./lifecycle.js");
const { runMigrations } = await import("../db/migrate.js");
const { syncOrphanDeletes, syncRuns, users } = await import("../db/queries.js");

runMigrations();

const ownerUserId = users.create({
  username: "owner",
  passwordHash: "x",
  role: "admin",
});

const silentLog = { warn: () => {}, info: () => {} };

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
  const runId = syncRuns.start({ triggeredBy: "manual", scope: "all", ownerUserId });
  const warns: Array<{ obj: object; msg?: string }> = [];
  const log = { warn: (obj: object, msg?: string) => warns.push({ obj, msg }), info: () => {} };

  const fakeApi = {
    deleteTransaction: async () => {
      throw new Error("should not be called");
    },
    updateTransaction: async () => {
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
    new Map(), // empty importedIdMap → lookup misses
    log,
  );

  syncRuns.finish({ id: runId, status: "success", totalImported: 0 });

  assert.equal(warns.length, 1, "expected exactly one warn");
  assert.equal(warns[0]?.msg, "remove: no matching Actual txn");
  assert.equal(syncOrphanDeletes.countUnacknowledged(), before, "no orphan inserted");
});

test("processRemovals: failed deleteTransaction inserts a sync_orphan_deletes row", async () => {
  const runId = syncRuns.start({ triggeredBy: "manual", scope: "all", ownerUserId });

  const fakeApi = {
    deleteTransaction: async () => {
      throw new Error("boom");
    },
    updateTransaction: async () => {
      throw new Error("should not be called");
    },
  };

  const importedIdMap = new Map([
    [
      "P-explode",
      { id: "actual-99", payee: "Acme", amount: -4200, date: "2026-05-15" },
    ],
  ]);

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
    importedIdMap,
    silentLog,
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
  const runId = syncRuns.start({ triggeredBy: "manual", scope: "all", ownerUserId });

  let deleted: string | undefined;
  const fakeApi = {
    deleteTransaction: async (id: string) => {
      deleted = id;
      return [] as never;
    },
    updateTransaction: async () => {
      throw new Error("should not be called");
    },
  };

  const importedIdMap = new Map([
    ["P-ok", { id: "actual-ok", payee: "Ok", amount: -100, date: "2026-05-16" }],
  ]);

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
    importedIdMap,
    silentLog,
  );

  syncRuns.finish({ id: runId, status: "success", totalImported: 0 });

  assert.equal(deleted, "actual-ok");
  assert.equal(syncOrphanDeletes.countUnacknowledged(), before);
});

test("processPromotions: hit case calls updateTransaction with promotion fields (no payee)", async () => {
  const runId = syncRuns.start({ triggeredBy: "manual", scope: "all", ownerUserId });

  const updates: Array<{ id: string; fields: Record<string, unknown> }> = [];
  const fakeApi = {
    deleteTransaction: async () => {
      throw new Error("should not be called");
    },
    updateTransaction: async (id: string, fields: Record<string, unknown>) => {
      updates.push({ id, fields });
      return undefined;
    },
  };

  const importedIdMap = new Map([
    ["pend_abc", { id: "actual-42", payee: "Original Payee", amount: -2000, date: "2026-05-10" }],
  ]);

  const result = await processPromotions(
    fakeApi as never,
    runId,
    "actual-acct-A",
    [
      {
        plaidPostedTransactionId: "post_xyz",
        plaidPendingTransactionId: "pend_abc",
        plaidAccountId: "plaid-acct-A",
        actualAccountId: "actual-acct-A",
        plaidItemId: "item-A",
        amount: -2400,
        date: "2026-05-11",
        importedPayee: "Restaurant Posted",
      },
    ],
    importedIdMap,
    silentLog,
  );

  syncRuns.finish({ id: runId, status: "success", totalImported: 0 });

  assert.equal(result.updated.length, 1);
  assert.equal(result.fellThrough.length, 0);
  assert.equal(updates.length, 1);
  assert.equal(updates[0]!.id, "actual-42");
  assert.deepEqual(updates[0]!.fields, {
    imported_id: "post_xyz",
    amount: -2400,
    cleared: true,
    date: "2026-05-11",
    imported_payee: "Restaurant Posted",
  });
  assert.equal("payee" in updates[0]!.fields, false, "payee must NOT be passed");
  assert.equal("payee_name" in updates[0]!.fields, false, "payee_name must NOT be passed");
});

test("processPromotions: miss case returns promotion in fellThrough, no updateTransaction call", async () => {
  const runId = syncRuns.start({ triggeredBy: "manual", scope: "all", ownerUserId });

  let updateCalls = 0;
  const fakeApi = {
    deleteTransaction: async () => {
      throw new Error("should not be called");
    },
    updateTransaction: async () => {
      updateCalls++;
      return undefined;
    },
  };

  const promotion = {
    plaidPostedTransactionId: "post_missing",
    plaidPendingTransactionId: "pend_missing",
    plaidAccountId: "plaid-acct-B",
    actualAccountId: "actual-acct-B",
    plaidItemId: "item-B",
    amount: -1500,
    date: "2026-05-12",
    importedPayee: "Some Place",
  };

  const result = await processPromotions(
    fakeApi as never,
    runId,
    "actual-acct-B",
    [promotion],
    new Map(), // pending row not in Actual
    silentLog,
  );

  syncRuns.finish({ id: runId, status: "success", totalImported: 0 });

  assert.equal(updateCalls, 0);
  assert.equal(result.updated.length, 0);
  assert.equal(result.fellThrough.length, 1);
  assert.deepEqual(result.fellThrough[0], promotion);
});

test("processPromotions: thrown updateTransaction is caught and promotion falls through", async () => {
  const runId = syncRuns.start({ triggeredBy: "manual", scope: "all", ownerUserId });

  const fakeApi = {
    deleteTransaction: async () => {
      throw new Error("should not be called");
    },
    updateTransaction: async () => {
      throw new Error("schema rejected");
    },
  };

  const importedIdMap = new Map([
    ["pend_err", { id: "actual-err", payee: null, amount: -100, date: "2026-05-13" }],
  ]);

  const promotion = {
    plaidPostedTransactionId: "post_err",
    plaidPendingTransactionId: "pend_err",
    plaidAccountId: "plaid-acct-C",
    actualAccountId: "actual-acct-C",
    plaidItemId: "item-C",
    amount: -100,
    date: "2026-05-13",
    importedPayee: "X",
  };

  const result = await processPromotions(
    fakeApi as never,
    runId,
    "actual-acct-C",
    [promotion],
    importedIdMap,
    silentLog,
  );

  syncRuns.finish({ id: runId, status: "success", totalImported: 0 });

  assert.equal(result.updated.length, 0);
  assert.equal(result.fellThrough.length, 1);
});

test("bucketDelta: promotion-paired removed entry is filtered from removals", () => {
  const targetByPlaidAcct = new Map([
    ["plaid-1", { mapping: { pending_visible: 1, actual_account_id: "actual-1" } }],
  ]);

  const result = bucketDelta({
    delta: {
      added: [
        {
          account_id: "plaid-1",
          transaction_id: "post_X",
          pending_transaction_id: "pend_X",
          pending: false,
          amount: 24.5,
          date: "2026-05-10",
          merchant_name: "Restaurant",
          name: "RESTAURANT POS",
        },
      ],
      modified: [],
      removed: [{ account_id: "plaid-1", transaction_id: "pend_X" }],
    },
    targetByPlaidAcct,
    plaidItemId: "item-1",
  });

  assert.equal(result.removalsByActualAccount.size, 0, "removal for pend_X must be dropped");
  assert.equal(result.importsByPlaidAccount.size, 0, "promotion must NOT be in imports");
  assert.equal(result.promotionsByActualAccount.get("actual-1")?.length, 1);
  const promotion = result.promotionsByActualAccount.get("actual-1")![0]!;
  assert.equal(promotion.plaidPostedTransactionId, "post_X");
  assert.equal(promotion.plaidPendingTransactionId, "pend_X");
  assert.equal(promotion.amount, -2450, "Plaid 24.5 → cents inverted -2450");
  assert.equal(promotion.importedPayee, "Restaurant");
  assert.equal(result.promotionPlaidTxnByPostedId.get("post_X")?.transaction_id, "post_X");
});

test("bucketDelta: orphan added (pending_transaction_id but no paired removed) still bucketed as promotion", () => {
  const targetByPlaidAcct = new Map([
    ["plaid-1", { mapping: { pending_visible: 1, actual_account_id: "actual-1" } }],
  ]);

  const result = bucketDelta({
    delta: {
      added: [
        {
          account_id: "plaid-1",
          transaction_id: "post_solo",
          pending_transaction_id: "pend_solo",
          pending: false,
          amount: 10,
          date: "2026-05-10",
          merchant_name: null,
          name: "Vendor",
        },
      ],
      modified: [],
      removed: [], // no paired removed in this delta
    },
    targetByPlaidAcct,
    plaidItemId: "item-1",
  });

  assert.equal(result.promotionsByActualAccount.get("actual-1")?.length, 1);
  assert.equal(result.importsByPlaidAccount.size, 0);
  assert.equal(result.removalsByActualAccount.size, 0);
  assert.equal(
    result.promotionsByActualAccount.get("actual-1")![0]!.importedPayee,
    "Vendor",
    "falls back to name when merchant_name is null",
  );
});

test("bucketDelta: pending_visible=false does NOT block promotion when row happens to exist", () => {
  // pending_visible=false: pending txns are normally filtered (shouldImportTxn=false).
  // But the posted txn (pending=false) is allowed regardless of pending_visible.
  // So the promotion path activates as long as pending_transaction_id is set.
  const targetByPlaidAcct = new Map([
    ["plaid-1", { mapping: { pending_visible: 0, actual_account_id: "actual-1" } }],
  ]);

  const result = bucketDelta({
    delta: {
      added: [
        {
          account_id: "plaid-1",
          transaction_id: "post_Y",
          pending_transaction_id: "pend_Y",
          pending: false, // posted txn — passes shouldImportTxn regardless of pending_visible
          amount: 50,
          date: "2026-05-10",
          merchant_name: "Store",
          name: "STORE",
        },
      ],
      modified: [],
      removed: [{ account_id: "plaid-1", transaction_id: "pend_Y" }],
    },
    targetByPlaidAcct,
    plaidItemId: "item-1",
  });

  assert.equal(result.promotionsByActualAccount.get("actual-1")?.length, 1);
  assert.equal(result.removalsByActualAccount.size, 0, "paired removal filtered out");
});

test("bucketDelta: modified with pending_transaction_id is also treated as a promotion", () => {
  const targetByPlaidAcct = new Map([
    ["plaid-1", { mapping: { pending_visible: 1, actual_account_id: "actual-1" } }],
  ]);

  const result = bucketDelta({
    delta: {
      added: [],
      modified: [
        {
          account_id: "plaid-1",
          transaction_id: "post_M",
          pending_transaction_id: "pend_M",
          pending: false,
          amount: 5,
          date: "2026-05-10",
          merchant_name: "M",
          name: "M",
        },
      ],
      removed: [{ account_id: "plaid-1", transaction_id: "pend_M" }],
    },
    targetByPlaidAcct,
    plaidItemId: "item-1",
  });

  assert.equal(result.promotionsByActualAccount.get("actual-1")?.length, 1);
  assert.equal(result.importsByPlaidAccount.size, 0);
  assert.equal(result.removalsByActualAccount.size, 0);
});

test("bucketDelta: ordinary removed (no promotion pair) still flows to removalsByActualAccount", () => {
  const targetByPlaidAcct = new Map([
    ["plaid-1", { mapping: { pending_visible: 1, actual_account_id: "actual-1" } }],
  ]);

  const result = bucketDelta({
    delta: {
      added: [],
      modified: [],
      removed: [{ account_id: "plaid-1", transaction_id: "pend_lonely" }],
    },
    targetByPlaidAcct,
    plaidItemId: "item-1",
  });

  assert.equal(result.removalsByActualAccount.get("actual-1")?.length, 1);
  assert.equal(
    result.removalsByActualAccount.get("actual-1")![0]!.plaidTransactionId,
    "pend_lonely",
  );
});
