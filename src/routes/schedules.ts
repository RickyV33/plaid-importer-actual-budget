import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { currentUser, requireUserId } from "../auth/middleware.js";
import { plaidItems, schedules } from "../db/queries.js";
import { nextOccurrence } from "../scheduler/recurrence.js";
import { scheduleFormFor, schedulesFor } from "../api/schedules.js";
import { render, viewerTimeZone } from "../views/render.js";

const cadenceSchema = z.object({
  name: z.string().optional(),
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
      name: parsed.data.name ?? null,
      plaidItemIds: itemIds,
      daysOfWeek,
      timeOfDay,
      repeatWeeks,
      timezone,
      nextRunAt,
    });
    return reply.redirect("/schedules");
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

    schedules.update(s.id, { name: parsed.data.name ?? null, plaidItemIds: itemIds, daysOfWeek, timeOfDay, repeatWeeks, timezone, nextRunAt });
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
