import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-importer-profiles-test-"));

process.env.APP_URL ??= "http://localhost:8080";
process.env.APP_USER ??= "test";
process.env.APP_PASSWORD ??= "test";
process.env.SESSION_SECRET ??= "x".repeat(32);
process.env.PLAID_CLIENT_ID ??= "test";
process.env.PLAID_SECRET ??= "test";
process.env.ACTUAL_SERVER_URL ??= "https://budget.example.com";
process.env.ACTUAL_SERVER_PASSWORD ??= "actual-pw";
process.env.TOKEN_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString("base64");
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.ACTUAL_CACHE_DIR = path.join(tmpDir, "actual-cache");

const { runMigrations } = await import("./migrate.js");
const { encrypt } = await import("../crypto/tokens.js");
const {
  users,
  plaidItems,
  plaidAccounts,
  profiles,
  profileAccountMappings,
  profileItemDelivery,
  plaidTxnEvents,
} = await import("./queries.js");

runMigrations();

const adminId = users.create({ username: "admin", passwordHash: "x", role: "admin" });
plaidItems.upsert({ id: "item-1", institutionId: "ins", institutionName: "Bank", accessTokenEnc: "enc", ownerUserId: adminId });
plaidAccounts.upsert({ itemId: "item-1", plaidAccountId: "acct-1", name: "Checking", officialName: null, mask: "0001", type: "depository", subtype: "checking" });

// A profile mapping acct-1 (created directly; profiles are made in the UI).
const defProfileId = profiles.create({
  ownerUserId: adminId,
  name: "Default",
  serverUrl: "https://budget.example.com",
  budgetId: "sync-1",
  serverPasswordEnc: encrypt("actual-pw"),
  encryptionPasswordEnc: null,
});
profileAccountMappings.upsert({ profileId: defProfileId, plaidAccountId: "acct-1", actualAccountId: "actual-1", actualAccountName: "Actual Checking" });
profileAccountMappings.setPendingVisible(defProfileId, "acct-1", true);
profileItemDelivery.ensure(defProfileId, "item-1", 0);

test("appendDeltaAndAdvanceCursor: writes events and advances the cursor atomically", () => {
  plaidTxnEvents.appendDeltaAndAdvanceCursor({
    itemId: "item-1",
    events: [
      { plaidAccountId: "acct-1", eventType: "added", plaidTxnId: "T1", payloadEnc: "x" },
      { plaidAccountId: "acct-1", eventType: "added", plaidTxnId: "T2", payloadEnc: "y" },
    ],
    nextCursor: "cursor-A",
  });
  assert.equal(plaidItems.get("item-1")?.cursor, "cursor-A");
  assert.equal(plaidTxnEvents.maxEventIdForItem("item-1"), 2);
  assert.equal(plaidTxnEvents.listForItemSince("item-1", 0).length, 2);
  assert.equal(plaidTxnEvents.listForItemSince("item-1", 1).length, 1);
});

test("profileItemDelivery: ensure is a no-op when present; watermark + min + prune", () => {
  const def = profiles.listByOwner(adminId)[0]!;
  profileItemDelivery.setWatermark(def.id, "item-1", 1);
  profileItemDelivery.ensure(def.id, "item-1", 99);
  assert.equal(profileItemDelivery.getWatermark(def.id, "item-1"), 1);
  assert.equal(profileItemDelivery.minDeliveredForItem("item-1"), 1);

  const before = plaidTxnEvents.listForItemSince("item-1", 0).length;
  const removed = plaidTxnEvents.pruneForItem("item-1", 1);
  assert.equal(removed, 1);
  assert.equal(plaidTxnEvents.listForItemSince("item-1", 0).length, before - 1);
});

test("minDeliveredForItem: null when no profile is connected", () => {
  assert.equal(profileItemDelivery.minDeliveredForItem("item-unknown"), null);
});

test("profileAccountMappings: same account maps independently across profiles", () => {
  const def = profiles.listByOwner(adminId)[0]!;
  const second = profiles.create({
    ownerUserId: adminId,
    name: "Second",
    serverUrl: "https://b.example.com",
    budgetId: "sync-2",
    serverPasswordEnc: "x",
    encryptionPasswordEnc: null,
  });
  profileAccountMappings.upsert({ profileId: second, plaidAccountId: "acct-1", actualAccountId: "actual-B", actualAccountName: "B" });

  assert.equal(profileAccountMappings.get(def.id, "acct-1")?.pending_visible, 1);
  assert.equal(profileAccountMappings.get(second, "acct-1")?.pending_visible, 0);
  profileAccountMappings.setPendingVisible(second, "acct-1", true);
  assert.equal(profileAccountMappings.get(def.id, "acct-1")?.pending_visible, 1);
  assert.equal(profileAccountMappings.get(second, "acct-1")?.pending_visible, 1);

  assert.equal(profiles.listConnectedToItem("item-1").length, 2);
});

test("findByOwnerServerBudget: detects same-owner duplicate budget, allows distinct", () => {
  const def = profiles.listByOwner(adminId)[0]!;
  const dup = profiles.findByOwnerServerBudget(adminId, def.server_url, def.budget_id);
  assert.ok(dup, "finds the existing profile for this server+budget");
  assert.equal(profiles.findByOwnerServerBudget(adminId, def.server_url, "different-budget"), undefined);

  const other = users.create({ username: "other", passwordHash: "x", role: "member" });
  assert.equal(profiles.findByOwnerServerBudget(other, def.server_url, def.budget_id), undefined);
});
