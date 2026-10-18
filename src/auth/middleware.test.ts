import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

process.env.APP_URL ??= "http://localhost:8080";
process.env.APP_USER ??= "test";
process.env.APP_PASSWORD ??= "test";
process.env.SESSION_SECRET ??= "x".repeat(32);
process.env.PLAID_CLIENT_ID ??= "test";
process.env.PLAID_SECRET ??= "test";
process.env.TOKEN_ENCRYPTION_KEY ??= crypto.randomBytes(32).toString("base64");
process.env.DATABASE_PATH = path.join(os.tmpdir(), `plaid-importer-mw-${process.pid}.db`);

const { authPreHandler } = await import("./middleware.js");

/** Runs the gate against a request and reports what it did. */
async function gate(method: string, url: string, authed = false) {
  const seen: { status?: number; body?: unknown; redirect?: string } = {};
  const reply = {
    code(status: number) {
      seen.status = status;
      return reply;
    },
    send(body: unknown) {
      seen.body = body;
      return reply;
    },
    redirect(to: string) {
      seen.redirect = to;
      return reply;
    },
  };
  await authPreHandler({ method, url, session: authed ? { authed: true } : {} } as never, reply as never);
  return seen;
}

test("authPreHandler: unauthenticated page requests redirect to login with next", async () => {
  assert.deepEqual(await gate("GET", "/history?offset=25"), { redirect: "/login?next=%2Fhistory%3Foffset%3D25" });
});

test("authPreHandler: unauthenticated API requests get 401 JSON, not a redirect", async () => {
  assert.deepEqual(await gate("GET", "/api/overview?tz=UTC"), { status: 401, body: { error: "unauthenticated" } });
  assert.deepEqual(await gate("POST", "/api/profiles"), { status: 401, body: { error: "unauthenticated" } });
});

test("authPreHandler: the allowlist and signed-in requests pass", async () => {
  assert.deepEqual(await gate("GET", "/login"), {});
  assert.deepEqual(await gate("GET", "/static/app/index.js"), {});
  assert.deepEqual(await gate("GET", "/api/overview", true), {});
});
