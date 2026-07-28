import { test } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_HISTORY_DAYS,
  MAX_HISTORY_DAYS,
  MIN_HISTORY_DAYS,
  parseInitialHistoryDays,
} from "./history.js";

test("parseInitialHistoryDays: accepts values inside the supported range", () => {
  assert.equal(parseInitialHistoryDays("90"), 90);
  assert.equal(parseInitialHistoryDays("365"), 365);
  assert.equal(parseInitialHistoryDays("730"), 730);
});

test("parseInitialHistoryDays: bounds are inclusive", () => {
  assert.equal(parseInitialHistoryDays(String(MIN_HISTORY_DAYS)), MIN_HISTORY_DAYS);
  assert.equal(parseInitialHistoryDays(String(MAX_HISTORY_DAYS)), MAX_HISTORY_DAYS);
});

test("parseInitialHistoryDays: falls back to the default when unset", () => {
  assert.equal(parseInitialHistoryDays(undefined), DEFAULT_HISTORY_DAYS);
  assert.equal(parseInitialHistoryDays(""), DEFAULT_HISTORY_DAYS);
  assert.equal(parseInitialHistoryDays("   "), DEFAULT_HISTORY_DAYS);
});

test("parseInitialHistoryDays: falls back when out of range", () => {
  assert.equal(parseInitialHistoryDays("89"), DEFAULT_HISTORY_DAYS);
  assert.equal(parseInitialHistoryDays("731"), DEFAULT_HISTORY_DAYS);
  assert.equal(parseInitialHistoryDays("0"), DEFAULT_HISTORY_DAYS);
  assert.equal(parseInitialHistoryDays("-365"), DEFAULT_HISTORY_DAYS);
});

test("parseInitialHistoryDays: falls back on non-integer input", () => {
  assert.equal(parseInitialHistoryDays("abc"), DEFAULT_HISTORY_DAYS);
  assert.equal(parseInitialHistoryDays("180.5"), DEFAULT_HISTORY_DAYS);
  assert.equal(parseInitialHistoryDays("1e3"), DEFAULT_HISTORY_DAYS); // 1000 > max
});
