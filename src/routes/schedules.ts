import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireUserId } from "../auth/middleware.js";
import { plaidItems, schedules } from "../db/queries.js";
import { render } from "../views/render.js";

const createSchema = z.object({
  intervalHours: z.coerce.number().int().positive(),
  plaidItemIds: z.union([z.string(), z.array(z.string())]).optional(),
  startAtMs: z.coerce.number().int().positive().optional(),
});

function asArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function registerScheduleRoutes(app: FastifyInstance): void {
  app.get("/schedules", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const ownerItems = plaidItems.listByOwner(userId);
    const itemName = new Map(ownerItems.map((i) => [i.id, i.institution_name ?? i.id]));

    const rows = schedules.listByOwner(userId).map((s) => ({
      id: s.id,
      intervalHours: s.interval_hours,
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
      schedules: rows,
      connections,
      error: null,
    });
  });

  app.post("/schedules", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_schedule" });

    // Keep only connections actually owned by the user.
    const owned = new Set(plaidItems.listByOwner(userId).map((i) => i.id));
    const itemIds = asArray(parsed.data.plaidItemIds).filter((id) => owned.has(id));
    if (itemIds.length === 0) return reply.code(400).send({ error: "no_connections_selected" });

    // First-run time: use the chosen start (rolled forward to the next future
    // slot so the time-of-day cadence holds), else one interval from now.
    const nowTs = Date.now();
    const intervalMs = parsed.data.intervalHours * 3600_000;
    let nextRunAt = nowTs + intervalMs;
    if (parsed.data.startAtMs) {
      nextRunAt = parsed.data.startAtMs;
      while (nextRunAt <= nowTs) nextRunAt += intervalMs;
    }

    schedules.create({
      ownerUserId: userId,
      plaidItemIds: itemIds,
      intervalHours: parsed.data.intervalHours,
      nextRunAt,
    });
    reply.redirect("/schedules");
  });

  app.post<{ Params: { id: string }; Body: { enabled?: string } }>(
    "/schedules/:id/toggle",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const s = schedules.getOwned(Number.parseInt(req.params.id, 10), userId);
      if (!s) return reply.code(404).send({ error: "not_found" });
      schedules.setEnabled(s.id, s.enabled !== 1);
      reply.redirect("/schedules");
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
