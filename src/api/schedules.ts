// The Schedules page (rows plus the week ahead) and the schedule form.

import { plaidItems, schedules, type ScheduleRow } from "../db/queries.js";
import { upcomingWeek, type WeekDay } from "../insights/week.js";
import { scheduleItemIds } from "./shared.js";

export type ScheduleView = {
  id: number;
  name: string | null;
  isLegacy: boolean;
  intervalHours: number | null;
  daysOfWeek: number[] | null;
  timeOfDay: string | null;
  repeatWeeks: number | null;
  timezone: string | null;
  enabled: boolean;
  lastRunAt: number | null;
  nextRunAt: number | null;
  connectionNames: string[];
};

export type ConnectionOption = { id: string; name: string };

export type SchedulesView = { schedules: ScheduleView[]; connections: ConnectionOption[]; week: WeekDay[] };

function connectionOptions(userId: number): ConnectionOption[] {
  return plaidItems.listByOwner(userId).map((i) => ({ id: i.id, name: i.institution_name ?? i.id }));
}

export function schedulesFor(userId: number, now: number, tz: string): SchedulesView {
  const connections = connectionOptions(userId);
  const itemName = new Map(connections.map((c) => [c.id, c.name]));
  const rows = schedules.listByOwner(userId);
  const label = (s: ScheduleRow) => s.name || scheduleItemIds(s.plaid_item_ids).map((id) => itemName.get(id) ?? id).join(", ");

  return {
    schedules: rows.map((s) => ({
      id: s.id,
      name: s.name,
      isLegacy: s.days_of_week === null,
      intervalHours: s.interval_hours,
      daysOfWeek: s.days_of_week ? (JSON.parse(s.days_of_week) as number[]) : null,
      timeOfDay: s.time_of_day,
      repeatWeeks: s.repeat_weeks,
      timezone: s.timezone,
      enabled: s.enabled === 1,
      lastRunAt: s.last_run_at,
      nextRunAt: s.next_run_at,
      connectionNames: scheduleItemIds(s.plaid_item_ids).map((id) => itemName.get(id) ?? id),
    })),
    connections,
    week: upcomingWeek(rows, label, now, tz),
  };
}

export type ScheduleFormView = {
  /** Null for a new schedule. */
  scheduleId: number | null;
  connections: ConnectionOption[];
  prefill: { name: string; daysOfWeek: number[]; timeOfDay: string; repeatWeeks: number; timezone: string; checkedItemIds: string[] } | null;
};

/** Undefined when `id` names a schedule the user doesn't own. */
export function scheduleFormFor(userId: number, id: number | null): ScheduleFormView | undefined {
  const connections = connectionOptions(userId);
  if (id === null) return { scheduleId: null, connections, prefill: null };
  const s = schedules.getOwned(id, userId);
  if (!s) return undefined;
  return {
    scheduleId: s.id,
    connections,
    // Best-effort prefill for legacy (interval) schedules.
    prefill: {
      name: s.name ?? "",
      daysOfWeek: s.days_of_week ? (JSON.parse(s.days_of_week) as number[]) : [1, 2, 3, 4, 5],
      timeOfDay: s.time_of_day ?? inferTimeOfDay(s.next_run_at),
      repeatWeeks: s.repeat_weeks ?? 1,
      timezone: s.timezone ?? "",
      checkedItemIds: scheduleItemIds(s.plaid_item_ids),
    },
  };
}

/** Infer a best-guess "HH:MM" time from a stored next_run_at UTC epoch. */
function inferTimeOfDay(nextRunAt: number | null): string {
  if (!nextRunAt) return "09:00";
  const d = new Date(nextRunAt);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
