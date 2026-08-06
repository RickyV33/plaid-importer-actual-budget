import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Fastify, { type FastifyInstance } from "fastify";
import fastifyFormbody from "@fastify/formbody";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-importer-settings-test-"));

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

const { runMigrations } = await import("../db/migrate.js");
const { settings, users, INITIAL_HISTORY_DAYS_KEY } = await import("../db/queries.js");
const { registerSettingsRoutes } = await import("./settings.js");

runMigrations();

const adminId = users.create({ username: "admin", passwordHash: "x", role: "admin" });
const memberId = users.create({ username: "member", passwordHash: "x", role: "member" });

/**
 * Minimal app with a stubbed session, so the handler's own validation and the
 * `requireAdmin` gate are exercised without the login/cookie machinery.
 */
async function buildApp(userId: number): Promise<FastifyInstance> {
  const app = Fastify();
  await app.register(fastifyFormbody);
  app.addHook("onRequest", async (req) => {
    (req as { session?: { userId: number } }).session = { userId };
  });
  registerSettingsRoutes(app);
  return app;
}

function post(app: FastifyInstance, value: string) {
  return app.inject({
    method: "POST",
    url: "/settings/initial-history",
    payload: { initial_history_days: value },
  });
}

test("admin can store a valid window", async (t) => {
  const app = await buildApp(adminId);
  t.after(() => app.close());
  settings.set(INITIAL_HISTORY_DAYS_KEY, "90");

  const res = await post(app, "365");

  assert.equal(res.statusCode, 200);
  assert.equal(settings.get(INITIAL_HISTORY_DAYS_KEY), "365");

  const view = await app.inject({ method: "GET", url: "/settings" });
  assert.equal(view.statusCode, 200);
  assert.match(view.body, /id="initial_history_days"[^>]*value="365"/);
});

test("the range bounds are inclusive", async (t) => {
  const app = await buildApp(adminId);
  t.after(() => app.close());

  assert.equal((await post(app, "90")).statusCode, 200);
  assert.equal(settings.get(INITIAL_HISTORY_DAYS_KEY), "90");
  assert.equal((await post(app, "730")).statusCode, 200);
  assert.equal(settings.get(INITIAL_HISTORY_DAYS_KEY), "730");
});

test("out-of-range and non-numeric input is rejected without changing the stored value", async (t) => {
  const app = await buildApp(adminId);
  t.after(() => app.close());
  settings.set(INITIAL_HISTORY_DAYS_KEY, "180");

  for (const bad of ["89", "0", "-1", "731", "1000", "abc", "90.5", ""]) {
    const res = await post(app, bad);
    assert.equal(res.statusCode, 400, `expected 400 for ${JSON.stringify(bad)}`);
    assert.equal(settings.get(INITIAL_HISTORY_DAYS_KEY), "180");
  }
});

test("a member is denied and cannot change the value", async (t) => {
  const app = await buildApp(memberId);
  t.after(() => app.close());
  settings.set(INITIAL_HISTORY_DAYS_KEY, "180");

  const write = await post(app, "365");
  assert.equal(write.statusCode, 403);
  assert.equal(settings.get(INITIAL_HISTORY_DAYS_KEY), "180");

  const view = await app.inject({ method: "GET", url: "/settings" });
  assert.equal(view.statusCode, 403);
  assert.ok(!view.body.includes("180"));
});
