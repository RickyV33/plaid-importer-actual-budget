import { test } from "node:test";
import assert from "node:assert/strict";
import { nextOccurrence } from "./recurrence.js";

// Helper: build an anchor epoch from a local date+time in a timezone
function localEpoch(dateStr: string, timeStr: string, tz: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const [h, m] = timeStr.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, m);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const getHM = (ms: number) => {
    const parts = fmt.formatToParts(new Date(ms));
    const h2 = Number(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
    const m2 = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
    return h2 * 60 + m2;
  };
  const first = guess + (h * 60 + m - getHM(guess)) * 60_000;
  const diff = (h * 60 + m) - getHM(first);
  return diff === 0 ? first : first + diff * 60_000;
}

// Helper: format a UTC epoch as local "YYYY-MM-DD HH:MM" in a timezone
function fmtLocal(ms: number, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
    hour12: false,
  }).format(new Date(ms)).replace(", ", " ");
}

const UTC = "UTC";
const NY = "America/New_York"; // UTC-5 / UTC-4 DST

// 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
const MON = 1, WED = 3, FRI = 5;

test("weekly: fires on next matching day same week", () => {
  // Monday 2024-06-10 09:00 UTC
  const anchor = localEpoch("2024-06-10", "09:00", UTC);
  const result = nextOccurrence([MON, WED, FRI], "09:00", 1, UTC, anchor);
  assert.equal(fmtLocal(result, UTC), "2024-06-12 09:00", "should fire Wednesday");
});

test("weekly: wraps to next week when no more days this week", () => {
  // Friday 2024-06-14 09:00 UTC
  const anchor = localEpoch("2024-06-14", "09:00", UTC);
  const result = nextOccurrence([MON, WED, FRI], "09:00", 1, UTC, anchor);
  assert.equal(fmtLocal(result, UTC), "2024-06-17 09:00", "should fire next Monday");
});

test("weekly: single day fires exactly 7 days later", () => {
  const anchor = localEpoch("2024-06-10", "09:00", UTC); // Monday
  const result = nextOccurrence([MON], "09:00", 1, UTC, anchor);
  assert.equal(fmtLocal(result, UTC), "2024-06-17 09:00");
});

test("bi-weekly: fires in same week if later matching day exists", () => {
  // Monday 2024-06-10
  const anchor = localEpoch("2024-06-10", "09:00", UTC);
  const result = nextOccurrence([MON, WED, FRI], "09:00", 2, UTC, anchor);
  assert.equal(fmtLocal(result, UTC), "2024-06-12 09:00", "same week Wed");
});

test("bi-weekly: skips off-week after exhausting current week", () => {
  // Friday 2024-06-14
  const anchor = localEpoch("2024-06-14", "09:00", UTC);
  const result = nextOccurrence([MON, WED, FRI], "09:00", 2, UTC, anchor);
  // Week of 2024-06-10 is "on". Next on-week is 2024-06-24.
  assert.equal(fmtLocal(result, UTC), "2024-06-24 09:00", "Mon two weeks later");
});

test("bi-weekly: second run also skips off-weeks", () => {
  // Second run on Wed 2024-06-26 (two weeks after 2024-06-12)
  const anchor = localEpoch("2024-06-26", "09:00", UTC);
  const result = nextOccurrence([MON, WED, FRI], "09:00", 2, UTC, anchor);
  assert.equal(fmtLocal(result, UTC), "2024-06-28 09:00", "Fri same on-week");
});

test("all days: fires tomorrow", () => {
  const anchor = localEpoch("2024-06-10", "09:00", UTC);
  const result = nextOccurrence([0, 1, 2, 3, 4, 5, 6], "09:00", 1, UTC, anchor);
  assert.equal(fmtLocal(result, UTC), "2024-06-11 09:00");
});

test("timezone: fires at local wall-clock time regardless of UTC offset", () => {
  // Anchor: 09:00 NY time on Mon 2024-06-10 = 13:00 UTC
  const anchor = localEpoch("2024-06-10", "09:00", NY);
  const result = nextOccurrence([WED], "09:00", 1, NY, anchor);
  assert.equal(fmtLocal(result, NY), "2024-06-12 09:00", "09:00 NY on Wednesday");
});

test("DST spring-forward: wall clock time preserved (America/New_York)", () => {
  // 2024-03-10 is the Sunday clocks spring forward in the US (2:00 AM → 3:00 AM).
  // Anchor: Friday 2024-03-08 09:00 NY
  const anchor = localEpoch("2024-03-08", "09:00", NY);
  // Next Wed after DST change is 2024-03-13
  const result = nextOccurrence([WED], "09:00", 1, NY, anchor);
  assert.equal(fmtLocal(result, NY), "2024-03-13 09:00", "wall clock time preserved across DST");
});

test("throws for empty daysOfWeek", () => {
  assert.throws(
    () => nextOccurrence([], "09:00", 1, UTC, Date.now()),
    /daysOfWeek must not be empty/,
  );
});
