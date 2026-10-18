import { test } from "node:test";
import assert from "node:assert/strict";

import { formatDay, formatNumber, formatPercent, formatRelative, formatWeekday } from "./format";

test("numbers and percents follow the locale", () => {
  assert.equal(formatNumber(12345, "en"), "12,345");
  assert.equal(formatNumber(12345, "es"), "12.345");
  assert.equal(formatPercent(0.754, "en"), "75%");
  assert.equal(formatPercent(0.025, "en"), "2.5%");
});

test("day keys don't shift with the zone", () => {
  assert.equal(formatDay("2026-10-19", "en"), "Oct 19");
  assert.equal(formatWeekday("2026-10-19", "en"), "Mon");
});

test("relative times pick the largest unit that fits", () => {
  const now = Date.UTC(2026, 9, 19, 12);
  assert.equal(formatRelative(now - 3 * 3_600_000, now, "en"), "3 hours ago");
  assert.equal(formatRelative(now + 5 * 3_600_000, now, "en"), "in 5 hours");
  assert.equal(formatRelative(now - 86_400_000, now, "en"), "yesterday");
  assert.equal(formatRelative(now - 10_000, now, "en"), "this minute");
});
