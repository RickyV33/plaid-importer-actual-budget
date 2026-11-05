import { test } from "node:test";
import assert from "node:assert/strict";
import Fastify from "fastify";
import { originGuard } from "./csrf.js";

test("write routes including login require the configured origin", async () => {
  const app = Fastify();
  app.addHook("preHandler", originGuard("https://plaid.example"));
  app.post("/login", async () => ({ ok: true }));
  app.get("/healthz", async () => ({ ok: true }));
  try {
    for (const headers of [{}, { origin: "null" }, { origin: "https://evil.example" }, { origin: "https://plaid.example.evil.example" }, { origin: "https://plaid.example", "sec-fetch-site": "cross-site" }]) {
      const res = await app.inject({ method: "POST", url: "/login", headers });
      assert.equal(res.statusCode, 403);
    }
    assert.equal((await app.inject({ method: "POST", url: "/login", headers: { origin: "https://plaid.example" } })).statusCode, 200);
    assert.equal((await app.inject({ method: "GET", url: "/healthz" })).statusCode, 200);
  } finally { await app.close(); }
});
