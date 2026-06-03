import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-importer-queries-test-"));
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

const { runMigrations } = await import("./migrate.js");
const { db } = await import("./client.js");
const {
  plaidItems,
  plaidAccounts,
  accountMappings,
  syncOrphanDeletes,
  syncRuns,
  users,
} = await import("./queries.js");

runMigrations();

const ownerUserId = users.create({
  username: "owner",
  passwordHash: "x",
  role: "admin",
});

function seedMapping(plaidAccountId: string, actualAccountId: string) {
  plaidItems.upsert({
    id: `item-${plaidAccountId}`,
    institutionId: "ins_1",
    institutionName: "Test Bank",
    accessTokenEnc: "fake-enc",
    ownerUserId,
  });
  plaidAccounts.upsert({
    itemId: `item-${plaidAccountId}`,
    plaidAccountId,
    name: "Test Account",
    officialName: null,
    mask: "0001",
    type: "depository",
    subtype: "checking",
  });
  accountMappings.upsert({
    plaidAccountId,
    actualAccountId,
    actualAccountName: "Actual Test",
  });
}

test("accountMappings.upsert: preserves pending_visible when actual_account_id changes", () => {
  seedMapping("plaid-A", "actual-A");

  // flip to visible
  const changed = accountMappings.setPendingVisible("plaid-A", true);
  assert.equal(changed, 1);

  let row = accountMappings.getByPlaidId("plaid-A");
  assert.equal(row?.pending_visible, 1);

  // change the actual_account_id via upsert
  accountMappings.upsert({
    plaidAccountId: "plaid-A",
    actualAccountId: "actual-A-renamed",
    actualAccountName: "Renamed",
  });

  row = accountMappings.getByPlaidId("plaid-A");
  assert.equal(row?.actual_account_id, "actual-A-renamed");
  assert.equal(row?.pending_visible, 1, "pending_visible must survive upsert");
});

test("syncRuns.backfillOwner: claims pre-migration runs with NULL owner", () => {
  // Simulate a run that predates multi-user-auth (owner_user_id column was NULL).
  db()
    .prepare(
      "INSERT INTO sync_runs (started_at, status, triggered_by, scope, total_imported) VALUES (?, 'success', 'manual', 'all', 0)",
    )
    .run(Date.now());

  const before = syncRuns.listRecentByOwner(ownerUserId, 50, 0).length;
  const claimed = syncRuns.backfillOwner(ownerUserId);
  assert.equal(claimed, 1, "exactly one NULL-owner run claimed");
  const after = syncRuns.listRecentByOwner(ownerUserId, 50, 0).length;
  assert.equal(after, before + 1, "backfilled run now visible to the owner");
});

test("accountMappings.setPendingVisible: returns 0 for non-existent mapping", () => {
  const changed = accountMappings.setPendingVisible("plaid-does-not-exist", true);
  assert.equal(changed, 0);
});

test("accountMappings.setPendingVisible: toggles 1 ↔ 0", () => {
  seedMapping("plaid-B", "actual-B");

  accountMappings.setPendingVisible("plaid-B", true);
  assert.equal(accountMappings.getByPlaidId("plaid-B")?.pending_visible, 1);

  accountMappings.setPendingVisible("plaid-B", false);
  assert.equal(accountMappings.getByPlaidId("plaid-B")?.pending_visible, 0);
});

test("syncOrphanDeletes: insert + listUnacknowledged + ack + count", () => {
  const runId = syncRuns.start({ triggeredBy: "manual", scope: "all", ownerUserId });

  const id1 = syncOrphanDeletes.insert({
    syncRunId: runId,
    plaidAccountId: "plaid-A",
    plaidTransactionId: "TXN1",
    payeeName: "Payee 1",
    amountCents: -1234,
    date: "2026-05-01",
    errorReason: "delete_failed: boom",
  });
  const id2 = syncOrphanDeletes.insert({
    syncRunId: runId,
    plaidAccountId: "plaid-A",
    plaidTransactionId: "TXN2",
    payeeName: null,
    amountCents: null,
    date: null,
    errorReason: "lookup_failed: nope",
  });

  syncRuns.finish({ id: runId, status: "failure", totalImported: 0 });

  const all = syncOrphanDeletes.listUnacknowledged();
  const found = all.filter((o) => o.id === id1 || o.id === id2);
  assert.equal(found.length, 2);
  assert.equal(syncOrphanDeletes.countUnacknowledged() >= 2, true);

  // ack first
  const ackChanges = syncOrphanDeletes.ack(id1);
  assert.equal(ackChanges, 1);

  // re-ack should be 0 (already acked)
  const reAck = syncOrphanDeletes.ack(id1);
  assert.equal(reAck, 0);

  // listUnacknowledged no longer contains id1
  const remaining = syncOrphanDeletes.listUnacknowledged();
  assert.equal(remaining.find((o) => o.id === id1), undefined);
  assert.notEqual(remaining.find((o) => o.id === id2), undefined);
});
