import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-importer-isolation-test-"));

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
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.ACTUAL_CACHE_DIR = path.join(tmpDir, "actual-cache");

const { runMigrations } = await import("./migrate.js");
const { users, plaidItems, plaidAccounts, accountMappings, syncRuns } = await import(
  "./queries.js"
);

runMigrations();

const alice = users.create({ username: "alice", passwordHash: "x", role: "admin" });
const bob = users.create({ username: "bob", passwordHash: "x", role: "member" });

// Alice owns item-A with one account + mapping; Bob owns item-B with one account.
plaidItems.upsert({ id: "item-A", institutionId: "ins", institutionName: "A Bank", accessTokenEnc: "enc", ownerUserId: alice });
plaidAccounts.upsert({ itemId: "item-A", plaidAccountId: "acct-A", name: "A Checking", officialName: null, mask: "0001", type: "depository", subtype: "checking" });
accountMappings.upsert({ plaidAccountId: "acct-A", actualAccountId: "actual-A", actualAccountName: "A" });

plaidItems.upsert({ id: "item-B", institutionId: "ins", institutionName: "B Bank", accessTokenEnc: "enc", ownerUserId: bob });
plaidAccounts.upsert({ itemId: "item-B", plaidAccountId: "acct-B", name: "B Savings", officialName: null, mask: "0002", type: "depository", subtype: "savings" });

test("listByOwner returns only the requesting user's items/accounts/mappings", () => {
  assert.deepEqual(plaidItems.listByOwner(alice).map((i) => i.id), ["item-A"]);
  assert.deepEqual(plaidItems.listByOwner(bob).map((i) => i.id), ["item-B"]);

  assert.deepEqual(plaidAccounts.listByOwner(alice).map((a) => a.plaid_account_id), ["acct-A"]);
  assert.deepEqual(plaidAccounts.listByOwner(bob).map((a) => a.plaid_account_id), ["acct-B"]);

  assert.deepEqual(accountMappings.listByOwner(alice).map((m) => m.plaid_account_id), ["acct-A"]);
  assert.deepEqual(accountMappings.listByOwner(bob).map((m) => m.plaid_account_id), []);
});

test("getOwned / getByPlaidIdOwned reject cross-owner access", () => {
  assert.ok(plaidItems.getOwned("item-A", alice));
  assert.equal(plaidItems.getOwned("item-A", bob), undefined);

  assert.ok(plaidAccounts.getByPlaidIdOwned("acct-A", alice));
  assert.equal(plaidAccounts.getByPlaidIdOwned("acct-A", bob), undefined);
});

test("sync run history is scoped by owner", () => {
  const aliceRun = syncRuns.start({ triggeredBy: "manual", scope: "all", ownerUserId: alice });
  syncRuns.finish({ id: aliceRun, status: "success", totalImported: 0 });
  const bobRun = syncRuns.start({ triggeredBy: "manual", scope: "all", ownerUserId: bob });
  syncRuns.finish({ id: bobRun, status: "success", totalImported: 0 });

  const aliceHistory = syncRuns.listRecentByOwner(alice, 50, 0).map((r) => r.id);
  const bobHistory = syncRuns.listRecentByOwner(bob, 50, 0).map((r) => r.id);
  assert.deepEqual(aliceHistory, [aliceRun]);
  assert.deepEqual(bobHistory, [bobRun]);
});
