import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import fastifyCookie from "@fastify/cookie";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-importer-health-test-"));

process.env.APP_URL ??= "http://localhost:8080";
process.env.APP_USER ??= "test";
process.env.APP_PASSWORD ??= "test";
process.env.SESSION_SECRET ??= "x".repeat(32);
process.env.PLAID_CLIENT_ID ??= "test";
process.env.PLAID_SECRET ??= "test";
process.env.TOKEN_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString("base64");
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.ACTUAL_CACHE_DIR = path.join(tmpDir, "actual-cache");

const { runMigrations } = await import("../db/migrate.js");
const { plaidAccounts, plaidItems, profiles, syncAccountResults, syncRuns, users } = await import("../db/queries.js");
const { registerHistoryRoutes } = await import("./history.js");
const { registerScheduleRoutes } = await import("./schedules.js");
const { registerBannerRoutes } = await import("./banners.js");

runMigrations();

const owner = users.create({ username: "owner", passwordHash: "x", role: "member" });
const bystander = users.create({ username: "bystander", passwordHash: "x", role: "member" });
const household = profiles.create({
  ownerUserId: owner,
  name: "Household",
  serverUrl: "https://budget.example",
  budgetId: "b1",
  serverPasswordEnc: "x",
  encryptionPasswordEnc: null,
});
plaidItems.upsert({ id: "item-1", institutionId: "ins", institutionName: "Harbor Bank", accessTokenEnc: "x", ownerUserId: owner });
plaidAccounts.upsert({
  itemId: "item-1",
  plaidAccountId: "acct-1",
  name: "Checking",
  officialName: null,
  mask: "0001",
  type: "depository",
  subtype: "checking",
});

async function buildApp(userId: number): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(fastifyCookie);
  app.addHook("onRequest", async (req) => {
    (req as { session?: { userId: number } }).session = { userId };
  });
  registerHistoryRoutes(app);
  registerScheduleRoutes(app);
  registerBannerRoutes(app);
  return app;
}

function failRun(reason: string): number {
  const id = syncRuns.start({ triggeredBy: "scheduled", scope: "all", ownerUserId: owner });
  syncAccountResults.record({ syncRunId: id, plaidAccountId: "acct-1", status: "failure", txnsImported: 0, reason, profileId: household });
  syncRuns.finish({ id, status: "failure", totalImported: 0 });
  return id;
}

const UNREACHABLE = /reach the Actual budget/;

test("an unreachable budget shows a banner on every page, naming it and linking to the fix", async (t) => {
  const app = await buildApp(owner);
  t.after(() => app.close());
  failRun("actual_unreachable: connect ECONNREFUSED");

  for (const url of ["/history", "/schedules"]) {
    const res = await app.inject({ method: "GET", url });
    assert.equal(res.statusCode, 200, url);
    assert.match(res.body, UNREACHABLE, url);
    assert.match(res.body, /Household/, url);
    assert.match(res.body, /href="\/profiles"/, url);
  }
});

test("other users don't see someone else's incident", async (t) => {
  const app = await buildApp(bystander);
  t.after(() => app.close());
  const res = await app.inject({ method: "GET", url: "/history" });
  assert.doesNotMatch(res.body, UNREACHABLE);
});

test("dismissing hides that incident; a new failing run brings it back; a success clears it", async (t) => {
  const app = await buildApp(owner);
  t.after(() => app.close());
  const runId = failRun("actual_unreachable: timeout");
  const key = `health:actual:${household}:${runId}`;

  const dismiss = await app.inject({ method: "POST", url: `/banners/${encodeURIComponent(key)}/dismiss` });
  assert.equal(dismiss.statusCode, 204);
  assert.doesNotMatch((await app.inject({ method: "GET", url: "/history" })).body, UNREACHABLE);

  failRun("actual_unreachable: timeout");
  assert.match((await app.inject({ method: "GET", url: "/history" })).body, UNREACHABLE);

  const ok = syncRuns.start({ triggeredBy: "manual", scope: "all", ownerUserId: owner });
  syncAccountResults.record({ syncRunId: ok, plaidAccountId: "acct-1", status: "success", txnsImported: 2, reason: null, profileId: household });
  syncRuns.finish({ id: ok, status: "success", totalImported: 2 });
  assert.doesNotMatch((await app.inject({ method: "GET", url: "/history" })).body, UNREACHABLE);
});

test("a bank that needs relinking shows a reconnect banner until it is active again", async (t) => {
  const app = await buildApp(owner);
  t.after(() => app.close());
  plaidItems.setStatus("item-1", "requires_relink");
  const flagged = await app.inject({ method: "GET", url: "/schedules" });
  assert.match(flagged.body, /Harbor Bank needs to be reconnected/);
  assert.match(flagged.body, /href="\/connections"/);

  plaidItems.setStatus("item-1", "active");
  assert.doesNotMatch((await app.inject({ method: "GET", url: "/schedules" })).body, /needs to be reconnected/);
});
