import { test } from "node:test";
import assert from "node:assert/strict";

import { inAppHref } from "./router";

const ORIGIN = "http://localhost:8080";

test("inAppHref: same-origin app pages are handled in the app", () => {
  assert.equal(inAppHref("/history?offset=25", ORIGIN, {}), "/history?offset=25");
  assert.equal(inAppHref("http://localhost:8080/profiles/3/edit", ORIGIN, {}), "/profiles/3/edit");
});

test("inAppHref: the browser keeps everything else", () => {
  assert.equal(inAppHref("/login", ORIGIN, {}), null);
  assert.equal(inAppHref("https://plaid.com/", ORIGIN, {}), null);
  assert.equal(inAppHref("/history", ORIGIN, { modified: true }), null);
  assert.equal(inAppHref("/history", ORIGIN, { target: "_blank" }), null);
  assert.equal(inAppHref("/history", ORIGIN, { download: true }), null);
});
