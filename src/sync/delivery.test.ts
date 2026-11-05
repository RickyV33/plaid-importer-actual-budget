import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { ActualApi, withActual } from "../actual/client.js";

process.env.APP_URL = "http://localhost:8080";
process.env.APP_USER = "test";
process.env.APP_PASSWORD = "test-password-long-enough";
process.env.SESSION_SECRET = "x".repeat(32);
process.env.PLAID_CLIENT_ID = "test";
process.env.PLAID_SECRET = "test";
process.env.TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString("base64");
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-delivery-"));
process.env.DATABASE_PATH = path.join(dir, "test.db");
const { runMigrations } = await import("../db/migrate.js");
const { users, profiles, plaidItems, plaidAccounts, profileAccountMappings, profileItemDelivery, plaidTxnEvents, syncRuns } = await import("../db/queries.js");
const { encrypt } = await import("../crypto/tokens.js");
const { drainProfile } = await import("./run.js");
runMigrations();

test("partial import retains journal watermark; successful retry advances it", async () => {
  const owner = users.create({ username: "owner", passwordHash: "test", role: "admin" });
  plaidItems.upsert({ id: "item", institutionId: "ins", institutionName: "Test", accessTokenEnc: "unused", ownerUserId: owner });
  plaidAccounts.upsert({ itemId: "item", plaidAccountId: "acct", name: "Amex", officialName: null, mask: "1234", type: "credit", subtype: "credit card" });
  const id = profiles.create({ ownerUserId: owner, name: "Test", serverUrl: "https://budget.example", budgetId: "budget", serverPasswordEnc: encrypt("test"), encryptionPasswordEnc: null });
  profileAccountMappings.upsert({ profileId: id, plaidAccountId: "acct", actualAccountId: "actual", actualAccountName: "Amex" });
  profileItemDelivery.ensure(id, "item", 0);
  const events = ["t1", "t2"].map((txnId) => ({ plaidAccountId: "acct", eventType: "added" as const, plaidTxnId: txnId,
    payloadEnc: encrypt(JSON.stringify({ account_id: "acct", transaction_id: txnId, amount: 1, date: "2026-10-30", name: "Test", pending: false })) }));
  plaidTxnEvents.appendDeltaAndAdvanceCursor({ itemId: "item", events, nextCursor: "pulled" });
  const saved = new Set<string>();
  let partial = true;
  const api = { importTransactions: async (_account: string, txns: Array<{ imported_id: string }>) => {
    const added: string[] = [];
    for (const txn of txns) {
      if (partial && txn.imported_id === "t2") continue;
      if (!saved.has(txn.imported_id)) { saved.add(txn.imported_id); added.push(txn.imported_id); }
    }
    return { added, updated: [], errors: partial ? ["failure"] : [] };
  } } as unknown as ActualApi;
  const session: typeof withActual = async (_conn, fn) => fn(api);
  const run = () => drainProfile({ profile: profiles.get(id)!, targetItemIds: new Set(["item"]), targetAccountIds: new Set(["acct"]), itemErrors: new Map(),
    runId: syncRuns.start({ triggeredBy: "manual", scope: "all", ownerUserId: owner }), log: { info() {}, warn() {} } }, session);
  assert.equal((await run()).anyFailure, true);
  assert.equal(profileItemDelivery.getWatermark(id, "item"), 0);
  assert.equal(plaidTxnEvents.listForItemSince("item", 0).length, 2);
  partial = false;
  assert.equal((await run()).anyFailure, false);
  assert.equal(profileItemDelivery.getWatermark(id, "item"), plaidTxnEvents.maxEventIdForItem("item"));
  assert.equal(saved.size, 2);
  assert.equal((await run()).imported, 0);
});
