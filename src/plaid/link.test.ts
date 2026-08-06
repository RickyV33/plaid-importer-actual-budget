import { test, mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { LinkTokenCreateRequest } from "plaid";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "plaid-importer-link-test-"));
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

const { runMigrations } = await import("../db/migrate.js");
const { settings, INITIAL_HISTORY_DAYS_KEY } = await import("../db/queries.js");
const { db } = await import("../db/client.js");
const { plaid } = await import("./client.js");
const { createLinkToken, createUpdateLinkToken, createAccountSelectLinkToken } =
  await import("./link.js");

runMigrations();

/** Tests share one temp DB, so clear the row rather than depend on ordering. */
function clearHistorySetting(): void {
  db().prepare("DELETE FROM settings WHERE key = ?").run(INITIAL_HISTORY_DAYS_KEY);
}

/** Capture the request Plaid would have received, without a network call. */
function captureLinkTokenCreate(): () => LinkTokenCreateRequest {
  let captured: LinkTokenCreateRequest | undefined;
  mock.method(plaid, "linkTokenCreate", async (req: LinkTokenCreateRequest) => {
    captured = req;
    return { data: { link_token: "link-sandbox-test" } };
  });
  return () => {
    assert.ok(captured, "linkTokenCreate was not called");
    return captured;
  };
}

test("createLinkToken: passes the configured window as days_requested", async (t) => {
  t.after(() => mock.restoreAll());
  settings.set(INITIAL_HISTORY_DAYS_KEY, "365");
  const req = captureLinkTokenCreate();

  const res = await createLinkToken();

  assert.equal(res.link_token, "link-sandbox-test");
  assert.deepEqual(req().transactions, { days_requested: 365 });
});

test("createLinkToken: falls back to 90 when the setting is unset", async (t) => {
  t.after(() => mock.restoreAll());
  clearHistorySetting();
  const req = captureLinkTokenCreate();

  await createLinkToken();

  assert.deepEqual(req().transactions, { days_requested: 90 });
});

test("createLinkToken: falls back to 90 when the stored value is invalid", async (t) => {
  t.after(() => mock.restoreAll());
  settings.set(INITIAL_HISTORY_DAYS_KEY, "not-a-number");
  const req = captureLinkTokenCreate();

  await createLinkToken();

  assert.deepEqual(req().transactions, { days_requested: 90 });
});

test("update-mode token creation does not request a history window", async (t) => {
  t.after(() => mock.restoreAll());
  // A configured window must not leak into re-auth, which would otherwise
  // change history depth as a side effect of re-linking.
  settings.set(INITIAL_HISTORY_DAYS_KEY, "730");
  const req = captureLinkTokenCreate();

  await createUpdateLinkToken("access-token-test");
  assert.equal(req().transactions, undefined);

  await createAccountSelectLinkToken("access-token-test");
  assert.equal(req().transactions, undefined);
});
