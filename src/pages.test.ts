import { test } from "node:test";
import assert from "node:assert/strict";

import { matchPage, pageUrl } from "./pages.js";

test("matchPage: fixed pages, with or without a query string", () => {
  assert.deepEqual(matchPage("/"), { page: "overview", params: {} });
  assert.deepEqual(matchPage("/history?offset=25"), { page: "history", params: {} });
  assert.deepEqual(matchPage("/link/oauth-return?oauth_state_id=abc"), { page: "oauthReturn", params: {} });
});

test("matchPage: parameters, and fixed segments win over them", () => {
  assert.deepEqual(matchPage("/profiles/12/edit"), { page: "profileEdit", params: { id: "12" } });
  assert.deepEqual(matchPage("/schedules/new"), { page: "scheduleNew", params: {} });
});

test("matchPage: anything else is not a page", () => {
  assert.equal(matchPage("/login"), null);
  assert.equal(matchPage("/profiles/12"), null);
  assert.equal(matchPage("/api/overview"), null);
  assert.equal(matchPage("/schedules/1/edit/x"), null);
});

test("pageUrl: fills parameters", () => {
  assert.equal(pageUrl("scheduleEdit", { id: 7 }), "/schedules/7/edit");
  assert.equal(pageUrl("overview"), "/");
});
