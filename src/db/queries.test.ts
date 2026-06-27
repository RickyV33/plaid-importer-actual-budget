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
  syncAccountResults,
  schedules,
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

test("countPullsForItemSince: counts distinct runs touching a connection, windowed and isolated", () => {
  seedMapping("plaid-RL", "actual-RL"); // creates item-plaid-RL + account plaid-RL
  seedMapping("plaid-RL2", "actual-RL2"); // a different connection
  const itemId = "item-plaid-RL";
  const now = Date.now();

  for (let i = 0; i < 2; i++) {
    const runId = syncRuns.start({ triggeredBy: "manual", scope: "selected", ownerUserId });
    syncAccountResults.record({ syncRunId: runId, plaidAccountId: "plaid-RL", status: "success", txnsImported: 1, reason: null, profileId: null });
    syncRuns.finish({ id: runId, status: "success", totalImported: 1 });
  }
  // a run touching the OTHER connection must not count for this item
  const otherRun = syncRuns.start({ triggeredBy: "manual", scope: "selected", ownerUserId });
  syncAccountResults.record({ syncRunId: otherRun, plaidAccountId: "plaid-RL2", status: "success", txnsImported: 1, reason: null, profileId: null });
  syncRuns.finish({ id: otherRun, status: "success", totalImported: 1 });

  assert.equal(syncRuns.countPullsForItemSince(itemId, now - 3600_000), 2);
  // window in the future excludes everything
  assert.equal(syncRuns.countPullsForItemSince(itemId, now + 3600_000), 0);
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

test("plaidAccounts: deselectMissing flips absent accounts, listByOwner hides them, re-select restores", () => {
  const itemId = "item-select";
  plaidItems.upsert({
    id: itemId,
    institutionId: "ins_1",
    institutionName: "Test Bank",
    accessTokenEnc: "fake-enc",
    ownerUserId,
  });
  const mkAccount = (id: string) =>
    plaidAccounts.upsert({
      itemId,
      plaidAccountId: id,
      name: `Account ${id}`,
      officialName: null,
      mask: "0001",
      type: "depository",
      subtype: "checking",
    });
  mkAccount("sel-1");
  mkAccount("sel-2");
  mkAccount("sel-3");

  const idsFor = (rows: { plaid_account_id: string }[]) =>
    new Set(rows.map((r) => r.plaid_account_id));

  // Plaid now only returns sel-1 and sel-3 → sel-2 becomes deselected.
  plaidAccounts.deselectMissing(itemId, ["sel-1", "sel-3"]);

  const ownedActive = idsFor(plaidAccounts.listByOwner(ownerUserId));
  assert.equal(ownedActive.has("sel-1"), true);
  assert.equal(ownedActive.has("sel-3"), true);
  assert.equal(ownedActive.has("sel-2"), false, "deselected account excluded from listByOwner");

  const ownedAll = idsFor(plaidAccounts.listByOwnerAll(ownerUserId));
  assert.equal(ownedAll.has("sel-2"), true, "deselected account still visible in listByOwnerAll");

  // Re-selecting sel-2 (it appears in Plaid's response again) reactivates it via upsert.
  mkAccount("sel-2");
  assert.equal(
    plaidAccounts.getByPlaidId("sel-2")?.access_status,
    "active",
    "re-upsert restores access_status to active",
  );
  assert.equal(idsFor(plaidAccounts.listByOwner(ownerUserId)).has("sel-2"), true);
});

test("plaidAccounts.upsertReconciled: re-added account with new id reuses old row via persistent_account_id", () => {
  const itemId = "item-recon-pid";
  plaidItems.upsert({
    id: itemId,
    institutionId: "ins_1",
    institutionName: "Test Bank",
    accessTokenEnc: "fake-enc",
    ownerUserId,
  });
  // Old account: active, has a persistent id and a mapping.
  plaidAccounts.upsert({
    itemId,
    plaidAccountId: "old-id",
    name: "Plaid Checking",
    officialName: null,
    mask: "0000",
    type: "depository",
    subtype: "checking",
    persistentAccountId: "PERSIST-1",
  });
  accountMappings.upsert({
    plaidAccountId: "old-id",
    actualAccountId: "actual-recon",
    actualAccountName: "Actual Recon",
  });
  // User deselects it, then re-adds — Plaid returns a NEW account_id, same persistent id.
  plaidAccounts.deselectMissing(itemId, []);
  plaidAccounts.upsertReconciled({
    itemId,
    plaidAccountId: "new-id",
    name: "Plaid Checking",
    officialName: null,
    mask: "0000",
    type: "depository",
    subtype: "checking",
    persistentAccountId: "PERSIST-1",
  });

  // Old row is gone, exactly one active row under the new id.
  assert.equal(plaidAccounts.getByPlaidId("old-id"), undefined, "stale row removed");
  const newRow = plaidAccounts.getByPlaidId("new-id");
  assert.equal(newRow?.access_status, "active");
  // Mapping migrated to the new id.
  assert.equal(accountMappings.getByPlaidId("old-id"), undefined);
  assert.equal(accountMappings.getByPlaidId("new-id")?.actual_account_id, "actual-recon");
});

test("plaidAccounts.upsertReconciled: falls back to deselected name/mask/type match when no persistent id", () => {
  const itemId = "item-recon-heuristic";
  plaidItems.upsert({
    id: itemId,
    institutionId: "ins_1",
    institutionName: "Test Bank",
    accessTokenEnc: "fake-enc",
    ownerUserId,
  });
  // Pre-existing duplicate with no persistent id (created before the column existed).
  plaidAccounts.upsert({
    itemId,
    plaidAccountId: "legacy-id",
    name: "Plaid Saving",
    officialName: null,
    mask: "1111",
    type: "depository",
    subtype: "savings",
  });
  accountMappings.upsert({
    plaidAccountId: "legacy-id",
    actualAccountId: "actual-legacy",
    actualAccountName: "Actual Legacy",
  });
  plaidAccounts.deselectMissing(itemId, []);

  plaidAccounts.upsertReconciled({
    itemId,
    plaidAccountId: "fresh-id",
    name: "Plaid Saving",
    officialName: null,
    mask: "1111",
    type: "depository",
    subtype: "savings",
    persistentAccountId: "PERSIST-NEW",
  });

  assert.equal(plaidAccounts.getByPlaidId("legacy-id"), undefined, "legacy duplicate merged away");
  assert.equal(accountMappings.getByPlaidId("fresh-id")?.actual_account_id, "actual-legacy");
});

test("plaidAccounts.upsertReconciled: does not merge a genuinely different account", () => {
  const itemId = "item-recon-distinct";
  plaidItems.upsert({
    id: itemId,
    institutionId: "ins_1",
    institutionName: "Test Bank",
    accessTokenEnc: "fake-enc",
    ownerUserId,
  });
  plaidAccounts.upsert({
    itemId,
    plaidAccountId: "checking-id",
    name: "Plaid Checking",
    officialName: null,
    mask: "0000",
    type: "depository",
    subtype: "checking",
    persistentAccountId: "PERSIST-CHK",
  });
  // A different, newly added account — distinct identity and persistent id.
  plaidAccounts.upsertReconciled({
    itemId,
    plaidAccountId: "credit-id",
    name: "Plaid Credit Card",
    officialName: null,
    mask: "3333",
    type: "credit",
    subtype: "credit card",
    persistentAccountId: "PERSIST-CC",
  });

  assert.notEqual(plaidAccounts.getByPlaidId("checking-id"), undefined, "existing account untouched");
  assert.notEqual(plaidAccounts.getByPlaidId("credit-id"), undefined, "new account inserted");
});

test("plaidAccounts.deleteByPlaidId: removes the account and cascades its mappings", () => {
  const itemId = "item-del";
  plaidItems.upsert({
    id: itemId,
    institutionId: "ins_1",
    institutionName: "Test Bank",
    accessTokenEnc: "fake-enc",
    ownerUserId,
  });
  plaidAccounts.upsert({
    itemId,
    plaidAccountId: "del-1",
    name: "Plaid Checking",
    officialName: null,
    mask: "0000",
    type: "depository",
    subtype: "checking",
  });
  accountMappings.upsert({
    plaidAccountId: "del-1",
    actualAccountId: "actual-del",
    actualAccountName: "Actual Del",
  });

  plaidAccounts.deleteByPlaidId("del-1");

  assert.equal(plaidAccounts.getByPlaidId("del-1"), undefined, "account row removed");
  assert.equal(accountMappings.getByPlaidId("del-1"), undefined, "mapping cascaded away");
});

test("plaidAccounts: newly upserted accounts default to active", () => {
  const itemId = "item-default";
  plaidItems.upsert({
    id: itemId,
    institutionId: "ins_1",
    institutionName: "Test Bank",
    accessTokenEnc: "fake-enc",
    ownerUserId,
  });
  plaidAccounts.upsert({
    itemId,
    plaidAccountId: "default-1",
    name: "Default",
    officialName: null,
    mask: "0001",
    type: "depository",
    subtype: "checking",
  });
  assert.equal(plaidAccounts.getByPlaidId("default-1")?.access_status, "active");
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

test("syncAccountResults.importedByItemForRun: sums per connection across fan-out", () => {
  seedMapping("plaid-IB1", "actual-IB1"); // item-plaid-IB1
  seedMapping("plaid-IB2", "actual-IB2"); // item-plaid-IB2 (different connection)
  const runId = syncRuns.start({ triggeredBy: "manual", scope: "selected", ownerUserId });

  // Connection 1: two fan-out rows for the same account (two profiles) → sum.
  syncAccountResults.record({ syncRunId: runId, plaidAccountId: "plaid-IB1", status: "success", txnsImported: 3, reason: null, profileId: null });
  syncAccountResults.record({ syncRunId: runId, plaidAccountId: "plaid-IB1", status: "success", txnsImported: 2, reason: null, profileId: null });
  // Connection 2: attempted but imported nothing.
  syncAccountResults.record({ syncRunId: runId, plaidAccountId: "plaid-IB2", status: "success", txnsImported: 0, reason: null, profileId: null });
  syncRuns.finish({ id: runId, status: "success", totalImported: 5 });

  const rows = syncAccountResults.importedByItemForRun(runId);
  const byItem = new Map(rows.map((r) => [r.item_id, r.imported]));
  assert.equal(byItem.get("item-plaid-IB1"), 5);
  assert.equal(byItem.get("item-plaid-IB2"), 0);
});

test("syncRuns.totalImportedSince: sums total_imported in window, owner-scoped, 0 when none", () => {
  // Dedicated owners so other tests' runs don't leak into the sums.
  const owner = users.create({ username: "totals-owner", passwordHash: "x", role: "member" });
  const otherOwner = users.create({ username: "totals-other", passwordHash: "x", role: "member" });
  const base = Date.now();
  const insert = (o: number, startedAt: number, imported: number) =>
    db()
      .prepare(
        "INSERT INTO sync_runs (started_at, status, triggered_by, scope, total_imported, owner_user_id) VALUES (?, 'success', 'manual', 'all', ?, ?)",
      )
      .run(startedAt, imported, o);

  // Within 7 days
  insert(owner, base - 1 * 86_400_000, 5);
  insert(owner, base - 3 * 86_400_000, 10);
  // Within 30 but outside 7
  insert(owner, base - 20 * 86_400_000, 100);
  // Outside 90
  insert(owner, base - 200 * 86_400_000, 999);
  // Another owner's run inside the window must not count
  insert(otherOwner, base - 1 * 86_400_000, 7);

  assert.equal(syncRuns.totalImportedSince(owner, base - 7 * 86_400_000), 15);
  assert.equal(syncRuns.totalImportedSince(owner, base - 30 * 86_400_000), 115);
  assert.equal(syncRuns.totalImportedSince(otherOwner, base - 7 * 86_400_000), 7);

  // No runs in a tiny future-only window → 0, not null
  assert.equal(syncRuns.totalImportedSince(owner, base + 86_400_000), 0);
});

test("schedules.create/update: persists name, trims it, and collapses blank to null", () => {
  const base = {
    ownerUserId,
    plaidItemIds: ["item-X"],
    nextRunAt: 1_000,
    daysOfWeek: [1, 3, 5],
    timeOfDay: "09:00",
    repeatWeeks: 1,
    timezone: "UTC",
  };

  // Named, with surrounding whitespace that should be trimmed.
  const namedId = schedules.create({ ...base, name: "  My Chase nightly  " });
  assert.equal(schedules.getOwned(namedId, ownerUserId)?.name, "My Chase nightly");

  // No name → stored as null.
  const unnamedId = schedules.create({ ...base });
  assert.equal(schedules.getOwned(unnamedId, ownerUserId)?.name, null);

  // Blank/whitespace name → stored as null.
  const blankId = schedules.create({ ...base, name: "   " });
  assert.equal(schedules.getOwned(blankId, ownerUserId)?.name, null);

  // Update can set and later clear the name.
  schedules.update(unnamedId, { ...base, name: "Renamed" });
  assert.equal(schedules.getOwned(unnamedId, ownerUserId)?.name, "Renamed");
  schedules.update(unnamedId, { ...base, name: "" });
  assert.equal(schedules.getOwned(unnamedId, ownerUserId)?.name, null);
});
