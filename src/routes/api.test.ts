import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Fastify, { type FastifyInstance } from "fastify";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-importer-api-test-"));

process.env.APP_URL ??= "http://localhost:8080";
process.env.APP_USER ??= "test";
process.env.APP_PASSWORD ??= "test";
process.env.SESSION_SECRET ??= "x".repeat(32);
process.env.PLAID_CLIENT_ID ??= "test";
process.env.PLAID_SECRET ??= "test";
process.env.ACTUAL_SERVER_PASSWORD = "";
process.env.TOKEN_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString("base64");
process.env.DATABASE_PATH = path.join(tmpDir, "test.db");
process.env.ACTUAL_CACHE_DIR = path.join(tmpDir, "actual-cache");

const { runMigrations } = await import("../db/migrate.js");
const { db } = await import("../db/client.js");
const { plaidItems, profiles, schedules, settings, users, INITIAL_HISTORY_DAYS_KEY } = await import("../db/queries.js");
const { registerApiRoutes } = await import("./api.js");

runMigrations();

const admin = users.create({ username: "admin", passwordHash: "x", role: "admin" });
const member = users.create({ username: "member", passwordHash: "x", role: "member" });
plaidItems.upsert({ id: "item-a", institutionId: "ins", institutionName: "Harbor Bank", accessTokenEnc: "x", ownerUserId: member });
plaidItems.upsert({ id: "item-admin", institutionId: "ins", institutionName: "Admin Bank", accessTokenEnc: "x", ownerUserId: admin });

async function appFor(userId: number): Promise<FastifyInstance> {
  const app = Fastify();
  app.addHook("onRequest", async (req) => {
    (req as { session?: { userId: number; authed: boolean } }).session = { userId, authed: true };
  });
  registerApiRoutes(app);
  t_apps.push(app);
  return app;
}
const t_apps: FastifyInstance[] = [];
test.after(() => Promise.all(t_apps.map((a) => a.close())));

const run = (owner: number, startedAt: number, status: string, imported: number) =>
  db()
    .prepare("INSERT INTO sync_runs (started_at, finished_at, status, triggered_by, scope, total_imported, owner_user_id) VALUES (?, ?, ?, 'manual', 'all', ?, ?)")
    .run(startedAt, startedAt, status, imported, owner);

test("GET /api/me names the user and role", async () => {
  const res = await (await appFor(member)).inject({ method: "GET", url: "/api/me" });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().username, "member");
  assert.equal(res.json().isAdmin, false);
});

test("GET /api/overview is owner-scoped and admin-only figures stay hidden from members", async () => {
  const now = Date.now();
  run(member, now - 3_600_000, "success", 5);
  run(admin, now - 3_600_000, "success", 50);
  const res = await (await appFor(member)).inject({ method: "GET", url: "/api/overview?tz=America/Chicago" });
  const body = res.json();
  assert.equal(body.importedTotals.d30, 5);
  assert.equal(body.connectionCount, 1);
  assert.equal(body.otherUsers, null);
  assert.equal(body.daily.length, 30);
});

test("GET /api/history summary and chart don't change with paging", async () => {
  const app = await appFor(member);
  const first = (await app.inject({ method: "GET", url: "/api/history?tz=UTC" })).json();
  const later = (await app.inject({ method: "GET", url: "/api/history?tz=UTC&offset=25" })).json();
  assert.deepEqual(later.summary, first.summary);
  assert.deepEqual(later.daily, first.daily);
  assert.equal(first.daily.length, 90);
});

test("GET /api/settings is admin-only", async () => {
  assert.equal((await (await appFor(member)).inject({ method: "GET", url: "/api/settings" })).statusCode, 403);
  assert.equal((await (await appFor(admin)).inject({ method: "GET", url: "/api/settings" })).statusCode, 200);
});

test("PUT /api/settings/initial-history validates and returns the new settings", async () => {
  const app = await appFor(admin);
  const bad = await app.inject({ method: "PUT", url: "/api/settings/initial-history", payload: { days: 5 } });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.json().error, "settings.errHistoryInvalid");
  const ok = await app.inject({ method: "PUT", url: "/api/settings/initial-history", payload: { days: 365 } });
  assert.equal(ok.statusCode, 200);
  assert.equal(ok.json().initialHistoryDays, 365);
  assert.equal(settings.get(INITIAL_HISTORY_DAYS_KEY), "365");
});

test("PUT /api/settings/sync-limit: blank disables, junk is rejected", async () => {
  const app = await appFor(admin);
  assert.equal((await app.inject({ method: "PUT", url: "/api/settings/sync-limit", payload: { max: "x", windowHours: 24 } })).statusCode, 400);
  const off = await app.inject({ method: "PUT", url: "/api/settings/sync-limit", payload: { max: "", windowHours: "" } });
  assert.equal(off.json().syncMax, "");
  const on = await app.inject({ method: "PUT", url: "/api/settings/sync-limit", payload: { max: 4, windowHours: 24 } });
  assert.equal(on.json().syncMax, "4");
});

test("POST /api/schedules: validation errors are catalog keys; only owned banks count", async () => {
  const app = await appFor(member);
  const base = { daysOfWeek: [1, 3], timeOfDay: "07:00", repeatWeeks: 1, timezone: "America/Chicago" };
  const noDays = await app.inject({ method: "POST", url: "/api/schedules", payload: { ...base, daysOfWeek: [], plaidItemIds: ["item-a"] } });
  assert.equal(noDays.json().error, "schedules.errInvalid");
  const notMine = await app.inject({ method: "POST", url: "/api/schedules", payload: { ...base, plaidItemIds: ["item-admin"] } });
  assert.equal(notMine.json().error, "schedules.errNoConnections");
  const badZone = await app.inject({ method: "POST", url: "/api/schedules", payload: { ...base, timezone: "Mars/Base", plaidItemIds: ["item-a"] } });
  assert.equal(badZone.json().error, "schedules.errInvalid");

  const ok = await app.inject({ method: "POST", url: "/api/schedules", payload: { ...base, name: "Mornings", plaidItemIds: ["item-a"] } });
  assert.equal(ok.statusCode, 200);
  const created = schedules.getOwned(ok.json().id, member)!;
  assert.equal(created.name, "Mornings");
  assert.ok(created.next_run_at! > Date.now());

  const toggled = await app.inject({ method: "POST", url: `/api/schedules/${created.id}/toggle` });
  assert.equal(toggled.json().enabled, false);
  const list = (await app.inject({ method: "GET", url: "/api/schedules?tz=America/Chicago" })).json();
  assert.equal(list.week.length, 7);
  assert.equal(list.schedules[0].enabled, false);
});

test("schedules belonging to someone else are 404", async () => {
  const theirs = schedules.create({
    ownerUserId: admin,
    name: null,
    plaidItemIds: ["item-admin"],
    daysOfWeek: [1],
    timeOfDay: "07:00",
    repeatWeeks: 1,
    timezone: "UTC",
    nextRunAt: Date.now() + 1000,
  });
  const app = await appFor(member);
  assert.equal((await app.inject({ method: "GET", url: `/api/schedules/${theirs}` })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: `/api/schedules/${theirs}/toggle` })).statusCode, 404);
});

test("POST /api/profiles: required fields, https only, password fallback, duplicates", async () => {
  const app = await appFor(member);
  const base = { name: "Household", serverUrl: "https://budget.example", budgetId: "b1" };
  assert.equal((await app.inject({ method: "POST", url: "/api/profiles", payload: { ...base, name: "" } })).json().error, "profile.errRequired");
  assert.equal(
    (await app.inject({ method: "POST", url: "/api/profiles", payload: { ...base, serverUrl: "http://budget.example" } })).json().error,
    "profile.errServerUrl",
  );
  // No password and no configured default.
  assert.equal((await app.inject({ method: "POST", url: "/api/profiles", payload: base })).json().error, "profile.errServerPw");

  const ok = await app.inject({ method: "POST", url: "/api/profiles", payload: { ...base, serverPassword: "pw" } });
  assert.equal(ok.statusCode, 200);
  assert.equal(profiles.getOwned(ok.json().id, member)?.name, "Household");
  const dup = await app.inject({ method: "POST", url: "/api/profiles", payload: { ...base, serverPassword: "pw" } });
  assert.equal(dup.statusCode, 409);
  assert.equal(dup.json().error, "profile.errDuplicate");

  // The edit form never carries secrets.
  const form = (await app.inject({ method: "GET", url: `/api/profiles/${ok.json().id}` })).json();
  assert.deepEqual(Object.keys(form.profile).sort(), ["budgetId", "id", "name", "serverUrl"]);
});
