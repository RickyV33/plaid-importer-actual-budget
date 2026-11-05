import { test } from "node:test";
import assert from "node:assert/strict";
import { endpoint, serverPasswordFor, sessionTokenFor } from "./endpoint.js";
import { assertSafeServerUrl } from "./hostname.js";

test("deployment password is bound to the exact configured endpoint", () => {
  const trusted = "https://budget.example";
  assert.equal(serverPasswordFor(trusted + "/", "", trusted, "secret"), "secret");
  for (const url of ["https://evil.example", trusted + ":8443", trusted + "/other", trusted + "@evil.example", trusted + "?x=1", trusted + "#x"]) {
    assert.equal(serverPasswordFor(url, "", trusted, "secret"), "");
  }
  assert.equal(serverPasswordFor(trusted, "", "", "secret"), "");
  assert.equal(serverPasswordFor(trusted, "explicit", trusted, "secret"), "explicit");
});

test("endpoint rejects embedded credentials and ambiguous forms", () => {
  for (const url of ["https://user:pass@budget.example", "http://budget.example", "https://budget.example/#fragment", "https://budget.example/?query", "https://budget.example/\\path"]) {
    assert.throws(() => endpoint(url));
  }
});

test("allowlist permits the intended LAN server and rejects other endpoints", async () => {
  const allowedServerUrl = "https://192.168.0.10:5006";
  assert.equal((await assertSafeServerUrl(allowedServerUrl, { allowedServerUrl })).origin, allowedServerUrl);
  for (const url of ["https://evil.example", "https://192.168.0.11:5006", allowedServerUrl + "/other"]) {
    await assert.rejects(assertSafeServerUrl(url, { allowedServerUrl }));
  }
});

test("HTTP exception requires explicit opt-in and an exact configured endpoint", async () => {
  const url = "http://actual-plaid:5006";
  await assert.rejects(assertSafeServerUrl(url));
  await assert.rejects(assertSafeServerUrl(url, { allowHttp: true }));
  await assert.rejects(assertSafeServerUrl("http://evil.example", { allowHttp: true, allowedServerUrl: url }));
  assert.equal((await assertSafeServerUrl(url, { allowHttp: true, allowedServerUrl: url })).origin, url);
  assert.equal(serverPasswordFor(url, "", url, "secret"), "");
});

test("Actual session tokens are bound to the exact configured endpoint", () => {
  assert.equal(sessionTokenFor("https://budget.example/", "https://budget.example", "token"), "token");
  for (const url of ["https://evil.example", "https://budget.example:8443", "https://budget.example/other", "https://user@budget.example"]) {
    assert.equal(sessionTokenFor(url, "https://budget.example", "token"), undefined);
  }
  assert.equal(sessionTokenFor("https://budget.example", "", "token"), undefined);
  assert.equal(sessionTokenFor("http://actual-plaid:5006", "http://actual-plaid:5006", "token"), undefined);
  assert.equal(sessionTokenFor("http://actual-plaid:5006", "http://actual-plaid:5006", "token", true), "token");
  assert.equal(sessionTokenFor("http://evil:5006", "http://actual-plaid:5006", "token", true), undefined);
});
