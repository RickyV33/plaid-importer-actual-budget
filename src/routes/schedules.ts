import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { currentUser, requireUserId } from "../auth/middleware.js";
import { plaidItems, schedules } from "../db/queries.js";
import { nextOccurrence } from "../scheduler/recurrence.js";
import { render } from "../views/render.js";

const cadenceSchema = z.object({
  daysOfWeek: z
    .union([z.string(), z.array(z.string())])
    .transform((v): string[] => (Array.isArray(v) ? v : [v]))
    .pipe(z.array(z.string().transform((s) => parseInt(s, 10))).refine((a) => a.length > 0 && a.every((n) => n >= 0 && n <= 6), { message: "select at least one valid day" })),
  timeOfDay: z.string().regex(/^\d{2}:\d{2}$/),
  repeatWeeks: z.coerce.number().int().min(1).max(52),
  timezone: z.string().min(1),
  plaidItemIds: z.union([z.string(), z.array(z.string())]).optional(),
});

function asArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function ownedItemIds(userId: number): Set<string> {
  return new Set(plaidItems.listByOwner(userId).map((i) => i.id));
}

export function registerScheduleRoutes(app: FastifyInstance): void {
  app.get("/schedules", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const ownerItems = plaidItems.listByOwner(userId);
    const itemName = new Map(ownerItems.map((i) => [i.id, i.institution_name ?? i.id]));

    const rows = schedules.listByOwner(userId).map((s) => ({
      id: s.id,
      isLegacy: s.days_of_week === null,
      intervalHours: s.interval_hours,
      daysOfWeek: s.days_of_week ? (JSON.parse(s.days_of_week) as number[]) : null,
      timeOfDay: s.time_of_day,
      repeatWeeks: s.repeat_weeks,
      timezone: s.timezone,
      enabled: s.enabled === 1,
      lastRunAt: s.last_run_at,
      nextRunAt: s.next_run_at,
      connectionNames: (() => {
        try {
          return (JSON.parse(s.plaid_item_ids) as string[]).map((id) => itemName.get(id) ?? id);
        } catch {
          return [];
        }
      })(),
    }));

    const connections = ownerItems.map((i) => ({ id: i.id, name: i.institution_name ?? i.id }));

    return render(reply, "schedules", {
      title: "Schedules",
      authed: true,
      isAdmin: currentUser(req)?.role === "admin",
      schedules: rows,
      connections,
      error: null,
    });
  });

  app.post("/schedules", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const parsed = cadenceSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_schedule" });

    const owned = ownedItemIds(userId);
    const itemIds = asArray(parsed.data.plaidItemIds).filter((id) => owned.has(id));
    if (itemIds.length === 0) return reply.code(400).send({ error: "no_connections_selected" });

    const { daysOfWeek, timeOfDay, repeatWeeks, timezone } = parsed.data;
    const nowTs = Date.now();
    const nextRunAt = nextOccurrence(daysOfWeek, timeOfDay, repeatWeeks, timezone, nowTs);

    schedules.create({
      ownerUserId: userId,
      plaidItemIds: itemIds,
      daysOfWeek,
      timeOfDay,
      repeatWeeks,
      timezone,
      nextRunAt,
    });
    return reply.redirect("/schedules");
  });

  app.get<{ Params: { id: string } }>("/schedules/:id/edit", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const s = schedules.getOwned(Number.parseInt(req.params.id, 10), userId);
    if (!s) return reply.code(404).send({ error: "not_found" });

    const ownerItems = plaidItems.listByOwner(userId);
    const connections = ownerItems.map((i) => ({ id: i.id, name: i.institution_name ?? i.id }));

    // Best-effort pre-populate for legacy schedules
    let checkedItemIds: string[];
    try {
      checkedItemIds = JSON.parse(s.plaid_item_ids) as string[];
    } catch {
      checkedItemIds = [];
    }

    const prefill = {
      daysOfWeek: s.days_of_week ? (JSON.parse(s.days_of_week) as number[]) : [1, 2, 3, 4, 5],
      timeOfDay: s.time_of_day ?? inferTimeOfDay(s.next_run_at),
      repeatWeeks: s.repeat_weeks ?? 1,
      timezone: s.timezone ?? "",
      checkedItemIds,
    };

    return render(reply, "schedules_edit", {
      title: "Edit Schedule",
      authed: true,
      isAdmin: currentUser(req)?.role === "admin",
      scheduleId: s.id,
      connections,
      prefill,
      error: null,
    });
  });

  app.post<{ Params: { id: string } }>("/schedules/:id/edit", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const s = schedules.getOwned(Number.parseInt(req.params.id, 10), userId);
    if (!s) return reply.code(404).send({ error: "not_found" });

    const parsed = cadenceSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_schedule" });

    const owned = ownedItemIds(userId);
    const itemIds = asArray(parsed.data.plaidItemIds).filter((id) => owned.has(id));
    if (itemIds.length === 0) return reply.code(400).send({ error: "no_connections_selected" });

    const { daysOfWeek, timeOfDay, repeatWeeks, timezone } = parsed.data;
    const nowTs = Date.now();
    const nextRunAt = nextOccurrence(daysOfWeek, timeOfDay, repeatWeeks, timezone, nowTs);

    schedules.update(s.id, { plaidItemIds: itemIds, daysOfWeek, timeOfDay, repeatWeeks, timezone, nextRunAt });
    return reply.redirect("/schedules");
  });

  app.post<{ Params: { id: string }; Body: { enabled?: string } }>(
    "/schedules/:id/toggle",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const s = schedules.getOwned(Number.parseInt(req.params.id, 10), userId);
      if (!s) return reply.code(404).send({ error: "not_found" });
      schedules.setEnabled(s.id, s.enabled !== 1);
      return reply.redirect("/schedules");
    },
  );

  app.post<{ Params: { id: string } }>("/schedules/:id/delete", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    const s = schedules.getOwned(Number.parseInt(req.params.id, 10), userId);
    if (!s) return reply.code(404).send({ error: "not_found" });
    schedules.remove(s.id);
    return reply.code(204).send();
  });
}

/** Infer a best-guess "HH:MM" time from a stored next_run_at UTC epoch. */
function inferTimeOfDay(nextRunAt: number | null): string {
  if (!nextRunAt) return "09:00";
  const d = new Date(nextRunAt);
  const h = String(d.getUTCHours()).padStart(2, "0");
  const m = String(d.getUTCMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}
