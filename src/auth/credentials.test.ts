import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-importer-creds-test-"));
const dbPath = path.join(tmpDir, "test.db");

process.env.APP_URL ??= "http://localhost:8080";
process.env.APP_USER = "seed-admin";
process.env.APP_PASSWORD = "seed-pass";
process.env.SESSION_SECRET ??= "x".repeat(32);
process.env.PLAID_CLIENT_ID ??= "test";
process.env.PLAID_SECRET ??= "test";
process.env.ACTUAL_SERVER_URL ??= "http://localhost:5006";
process.env.ACTUAL_SERVER_PASSWORD ??= "test";
process.env.ACTUAL_SYNC_ID ??= "test";
process.env.TOKEN_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString("base64");
process.env.DATABASE_PATH = dbPath;
process.env.ACTUAL_CACHE_DIR = path.join(tmpDir, "actual-cache");

const { runMigrations } = await import("../db/migrate.js");
const { users } = await import("../db/queries.js");
const { initCredentials, createUser, verify, seedAdminFromEnv } = await import(
  "./credentials.js"
);

runMigrations();
await initCredentials();

// Runs first, while the users table is still empty.
test("seedAdminFromEnv: creates the admin on an empty users table, idempotent after", async () => {
  assert.equal(users.count(), 0);

  await seedAdminFromEnv();
  assert.equal(users.count(), 1);
  const admin = users.getByUsername("seed-admin");
  assert.equal(admin?.role, "admin");

  // Idempotent: running again does not create a second user.
  await seedAdminFromEnv();
  assert.equal(users.count(), 1);
});

test("verify: returns the user on a correct password", async () => {
  await createUser("alice", "correct horse", "member");
  const user = await verify("alice", "correct horse");
  assert.ok(user);
  assert.equal(user?.username, "alice");
  assert.equal(user?.role, "member");
});

test("verify: returns null on a wrong password", async () => {
  const user = await verify("alice", "wrong");
  assert.equal(user, null);
});

test("verify: returns null on an unknown username (and does not throw)", async () => {
  const user = await verify("nobody", "whatever");
  assert.equal(user, null);
});
