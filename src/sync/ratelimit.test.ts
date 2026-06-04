import { test } from "node:test";
import assert from "node:assert/strict";

import { parseSyncLimit, retryAfterMinutes } from "./ratelimit.js";

test("parseSyncLimit: valid values", () => {
  assert.deepEqual(parseSyncLimit("5", "24"), { max: 5, windowHours: 24 });
  assert.deepEqual(parseSyncLimit("5.9", "24"), { max: 5, windowHours: 24 });
});

test("parseSyncLimit: disabled / invalid → null", () => {
  assert.equal(parseSyncLimit("0", "24"), null);
  assert.equal(parseSyncLimit("5", "0"), null);
  assert.equal(parseSyncLimit("", "24"), null);
  assert.equal(parseSyncLimit(undefined, undefined), null);
  assert.equal(parseSyncLimit("abc", "24"), null);
  assert.equal(parseSyncLimit("-3", "24"), null);
});

test("retryAfterMinutes: time until the window frees a slot", () => {
  const now = 1_000_000_000_000;
  assert.equal(retryAfterMinutes(now, 1, now), 60);
  assert.equal(retryAfterMinutes(now - 30 * 60_000, 1, now), 30);
  // already past → at least 1
  assert.equal(retryAfterMinutes(now - 2 * 3600_000, 1, now), 1);
});
