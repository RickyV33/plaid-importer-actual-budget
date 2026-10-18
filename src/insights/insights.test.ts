import { test } from "node:test";
import assert from "node:assert/strict";

import type { ScheduleRow } from "../db/queries.js";
import { freshness, rateLimitUsage } from "./connections.js";
import { coverage } from "./coverage.js";
import { byConnection, dailySeries } from "./imports.js";
import { outcomeSummary } from "./runs.js";
import { dayKey, lastDays, safeTimeZone } from "./time.js";
import { upcomingWeek } from "./week.js";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
// Monday 2026-10-19, 12:00 UTC.
const MONDAY_NOON = Date.UTC(2026, 9, 19, 12, 0);

// ── time ─────────────────────────────────────────────────────────────

test("safeTimeZone: keeps a valid IANA zone", () => {
  assert.equal(safeTimeZone("America/Chicago"), "America/Chicago");
});

test("safeTimeZone: invalid or missing zone falls back to UTC", () => {
  assert.equal(safeTimeZone("Not/AZone"), "UTC");
  assert.equal(safeTimeZone(""), "UTC");
  assert.equal(safeTimeZone(undefined), "UTC");
});

test("lastDays: steps back across a month boundary, oldest first", () => {
  assert.deepEqual(lastDays(Date.UTC(2026, 10, 2, 12), 3, "UTC"), ["2026-10-31", "2026-11-01", "2026-11-02"]);
});

test("dayKey: an instant early in UTC is the previous day in Chicago", () => {
  assert.equal(dayKey(Date.UTC(2026, 9, 19, 2, 0), "America/Chicago"), "2026-10-18");
});

// ── imports ──────────────────────────────────────────────────────────

test("dailySeries: zero-fills days with no runs", () => {
  const series = dailySeries([{ started_at: MONDAY_NOON - 3 * DAY, total_imported: 5 }], 7, MONDAY_NOON, "UTC");
  assert.equal(series.length, 7);
  assert.deepEqual(series.map((d) => d.imported), [0, 0, 0, 5, 0, 0, 0]);
  assert.equal(series[6]!.date, "2026-10-19");
});

test("dailySeries: sums runs on the same day and ignores runs outside the window", () => {
  const series = dailySeries(
    [
      { started_at: MONDAY_NOON - HOUR, total_imported: 2 },
      { started_at: MONDAY_NOON - 2 * HOUR, total_imported: 3 },
      { started_at: MONDAY_NOON - 30 * DAY, total_imported: 99 },
    ],
    7,
    MONDAY_NOON,
    "UTC",
  );
  assert.equal(series.reduce((n, d) => n + d.imported, 0), 5);
  assert.equal(series[6]!.imported, 5);
});

test("dailySeries: buckets by the viewer's time zone", () => {
  // 02:00 UTC on the 19th is still the 18th in Chicago.
  const run = { started_at: Date.UTC(2026, 9, 19, 2, 0), total_imported: 4 };
  const chicago = dailySeries([run], 2, MONDAY_NOON, "America/Chicago");
  assert.deepEqual(chicago, [
    { date: "2026-10-18", imported: 4 },
    { date: "2026-10-19", imported: 0 },
  ]);
  const utc = dailySeries([run], 2, MONDAY_NOON, "UTC");
  assert.equal(utc[1]!.imported, 4);
});

test("byConnection: shares of the total, biggest first, zero rows kept", () => {
  const rows = byConnection(
    [
      { item_id: "b", imported: 10 },
      { item_id: "a", imported: 30 },
    ],
    [
      { id: "a", label: "Bank A" },
      { id: "b", label: "Bank B" },
      { id: "c", label: "Bank C" },
    ],
  );
  assert.deepEqual(
    rows.map((r) => [r.key, r.value, r.share]),
    [
      ["a", 30, 0.75],
      ["b", 10, 0.25],
      ["c", 0, 0],
    ],
  );
});

test("byConnection: nothing imported gives zero shares, not NaN", () => {
  const rows = byConnection([], [{ id: "a", label: "Bank A" }]);
  assert.deepEqual(rows, [{ key: "a", label: "Bank A", value: 0, share: 0 }]);
});

// ── runs ─────────────────────────────────────────────────────────────

test("outcomeSummary: mixed outcomes", () => {
  const runs = [
    ...Array.from({ length: 9 }, () => ({ status: "success", total_imported: 2 })),
    { status: "failure", total_imported: 0 },
  ];
  assert.deepEqual(outcomeSummary(runs), { runs: 10, succeeded: 9, failed: 1, rate: 0.9, imported: 18 });
});

test("outcomeSummary: running runs are left out of the rate", () => {
  const s = outcomeSummary([
    { status: "success", total_imported: 1 },
    { status: "running", total_imported: 0 },
  ]);
  assert.equal(s.runs, 1);
  assert.equal(s.rate, 1);
});

test("outcomeSummary: no finished runs means no rate", () => {
  assert.equal(outcomeSummary([]).rate, null);
  assert.equal(outcomeSummary([{ status: "running", total_imported: 0 }]).rate, null);
});

// ── connections ──────────────────────────────────────────────────────

test("freshness: boundaries", () => {
  const at = (ageMs: number) => freshness({ status: "active", last_synced_at: MONDAY_NOON - ageMs }, MONDAY_NOON);
  assert.equal(at(HOUR), "fresh");
  assert.equal(at(DAY), "fresh");
  assert.equal(at(DAY + 1), "stale");
  assert.equal(at(3 * DAY), "stale");
  assert.equal(at(7 * DAY), "stale");
  assert.equal(at(7 * DAY + 1), "old");
  assert.equal(freshness({ status: "active", last_synced_at: null }, MONDAY_NOON), "never");
});

test("freshness: relink wins over a recent sync", () => {
  assert.equal(freshness({ status: "requires_relink", last_synced_at: MONDAY_NOON - HOUR }, MONDAY_NOON), "relink");
});

test("rateLimitUsage: no ceiling, nothing to meter", () => {
  assert.equal(rateLimitUsage(2, MONDAY_NOON, null, MONDAY_NOON), null);
});

test("rateLimitUsage: partly used", () => {
  assert.deepEqual(rateLimitUsage(2, MONDAY_NOON - HOUR, { max: 4, windowHours: 24 }, MONDAY_NOON), {
    used: 2,
    max: 4,
    windowHours: 24,
    full: false,
    freesAt: null,
  });
});

test("rateLimitUsage: at the ceiling, frees when the oldest pull rolls off", () => {
  const u = rateLimitUsage(4, MONDAY_NOON - 20 * HOUR, { max: 4, windowHours: 24 }, MONDAY_NOON);
  assert.equal(u?.full, true);
  assert.equal(u?.freesAt, MONDAY_NOON + 4 * HOUR);
});

// ── coverage ─────────────────────────────────────────────────────────

test("coverage: partial, and deselected accounts count in neither figure", () => {
  const accounts = [
    { plaid_account_id: "a", access_status: "active" },
    { plaid_account_id: "b", access_status: "active" },
    { plaid_account_id: "c", access_status: "active" },
    { plaid_account_id: "d", access_status: "active" },
    { plaid_account_id: "e", access_status: "deselected" },
  ];
  assert.deepEqual(coverage(accounts, new Set(["a", "b", "c", "e"])), { routed: 3, total: 4 });
});

// ── week ─────────────────────────────────────────────────────────────

function schedule(over: Partial<ScheduleRow>): ScheduleRow {
  return {
    id: 1,
    owner_user_id: 1,
    name: "Weekdays",
    plaid_item_ids: "[]",
    interval_hours: null,
    days_of_week: "[1,3,5]",
    time_of_day: "07:00",
    repeat_weeks: 1,
    timezone: "UTC",
    enabled: 1,
    last_run_at: null,
    next_run_at: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

test("upcomingWeek: Mon/Wed/Fri at 07:00 viewed on a Monday morning", () => {
  const mondayEarly = Date.UTC(2026, 9, 19, 5, 0);
  const week = upcomingWeek([schedule({ next_run_at: Date.UTC(2026, 9, 19, 7, 0) })], (s) => s.name!, mondayEarly, "UTC");
  assert.equal(week.length, 7);
  assert.equal(week[0]!.date, "2026-10-19");
  assert.deepEqual(
    week.map((d) => d.runs.length),
    [1, 0, 1, 0, 1, 0, 0],
  );
  assert.equal(week[2]!.runs[0]!.at, Date.UTC(2026, 9, 21, 7, 0));
  assert.equal(week[0]!.runs[0]!.name, "Weekdays");
});

test("upcomingWeek: paused and legacy schedules are left out", () => {
  const week = upcomingWeek(
    [
      schedule({ enabled: 0, next_run_at: MONDAY_NOON + HOUR }),
      schedule({ id: 2, days_of_week: null, time_of_day: null, interval_hours: 6, next_run_at: MONDAY_NOON + HOUR }),
    ],
    (s) => String(s.id),
    MONDAY_NOON,
    "UTC",
  );
  assert.equal(week.reduce((n, d) => n + d.runs.length, 0), 0);
});

test("upcomingWeek: a missed run shows today", () => {
  const week = upcomingWeek(
    [schedule({ days_of_week: "[0]", next_run_at: MONDAY_NOON - 2 * HOUR })],
    (s) => s.name!,
    MONDAY_NOON,
    "UTC",
  );
  assert.equal(week[0]!.runs.length, 1);
  assert.equal(week[6]!.runs.length, 1); // the following Sunday
});
