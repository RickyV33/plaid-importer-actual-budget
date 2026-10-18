import { test } from "node:test";
import assert from "node:assert/strict";

import { makeFormat } from "./format.js";

test("makeFormat: numbers and percents follow the locale", () => {
  assert.equal(makeFormat("en", "UTC").num(12345), "12,345");
  assert.equal(makeFormat("es", "UTC").num(12345), "12.345");
  assert.equal(makeFormat("en", "UTC").pct(0.754), "75%");
});

test("makeFormat: day keys don't shift with the viewer's zone", () => {
  // A Pacific viewer must still see Oct 19 for the key 2026-10-19.
  const f = makeFormat("en", "America/Los_Angeles");
  assert.equal(f.day("2026-10-19"), "Oct 19");
  assert.equal(f.weekday("2026-10-19"), "Mon");
});

test("makeFormat: times are shown in the viewer's zone", () => {
  const at = Date.UTC(2026, 9, 19, 12, 0);
  assert.equal(makeFormat("en", "UTC").time(at), "12:00 PM");
  assert.equal(makeFormat("en", "America/Chicago").time(at), "7:00 AM");
});
