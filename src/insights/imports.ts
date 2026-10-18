// What got imported, and where: a per-day series and a per-connection split.

import { dayKey, lastDays } from "./time.js";

export type DayPoint = { date: string; imported: number };

/** One entry per calendar day (oldest first), zero-filled, summing each run on the day it started. */
export function dailySeries(
  runs: { started_at: number; total_imported: number }[],
  days: number,
  now: number,
  tz: string,
): DayPoint[] {
  const keys = lastDays(now, days, tz);
  const sums = new Map(keys.map((k) => [k, 0]));
  for (const r of runs) {
    const k = dayKey(r.started_at, tz);
    const prev = sums.get(k);
    if (prev !== undefined) sums.set(k, prev + r.total_imported);
  }
  return keys.map((date) => ({ date, imported: sums.get(date) ?? 0 }));
}

export type ShareRow = { key: string; label: string; value: number; share: number };

/**
 * Imports per connection, biggest first. Every connection is listed, so one
 * that imported nothing still shows (with zero). `share` is of the total, 0 when
 * nothing was imported.
 */
export function byConnection(
  imported: { item_id: string; imported: number }[],
  items: { id: string; label: string }[],
): ShareRow[] {
  const sums = new Map(imported.map((r) => [r.item_id, r.imported]));
  const total = items.reduce((n, i) => n + (sums.get(i.id) ?? 0), 0);
  return items
    .map((i) => {
      const value = sums.get(i.id) ?? 0;
      return { key: i.id, label: i.label, value, share: total ? value / total : 0 };
    })
    .sort((a, b) => b.value - a.value);
}
