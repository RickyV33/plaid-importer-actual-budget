// The next seven days of scheduled runs, laid out by the viewer's calendar day.

import type { ScheduleRow } from "../db/queries.js";
import { nextOccurrence } from "../scheduler/recurrence.js";
import { dayKey, nextDays } from "./time.js";

export type WeekRun = { at: number; scheduleId: number; name: string };
export type WeekDay = { date: string; runs: WeekRun[] };

/**
 * Runs chain the way the scheduler fires them: from the stored next run, each
 * following one is the next occurrence after it. Paused and legacy
 * (interval-based) schedules are left out.
 */
export function upcomingWeek(
  schedules: ScheduleRow[],
  nameOf: (s: ScheduleRow) => string,
  now: number,
  tz: string,
): WeekDay[] {
  const keys = nextDays(now, 7, tz);
  const byDay = new Map<string, WeekRun[]>(keys.map((k) => [k, []]));
  const last = keys[keys.length - 1]!;

  for (const s of schedules) {
    if (s.enabled !== 1 || !s.days_of_week || !s.time_of_day || !s.timezone) continue;
    const days = JSON.parse(s.days_of_week) as number[];
    if (!days.length) continue;
    const step = (from: number) => nextOccurrence(days, s.time_of_day!, s.repeat_weeks ?? 1, s.timezone!, from);
    // A missed run fires on the next tick, so it belongs to today.
    let at = s.next_run_at === null ? step(now) : Math.max(s.next_run_at, now);
    // A week holds at most 7 runs per schedule; the cap guards against a bad rule.
    for (let i = 0; i < 14; i++) {
      const k = dayKey(at, tz);
      if (k > last) break;
      byDay.get(k)?.push({ at, scheduleId: s.id, name: nameOf(s) });
      at = step(at);
    }
  }

  return keys.map((date) => ({ date, runs: byDay.get(date)!.sort((a, b) => a.at - b.at) }));
}
