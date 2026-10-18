import type { FastifyInstance } from "fastify";

import { requireUserId } from "../auth/middleware.js";
import { schedules } from "../db/queries.js";

// Creating, editing, and toggling schedules live in routes/api.ts; this is the
// delete the app calls from a schedule row.
export function registerScheduleRoutes(app: FastifyInstance): void {
  app.post<{ Params: { id: string } }>("/schedules/:id/delete", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    const s = schedules.getOwned(Number.parseInt(req.params.id, 10), userId);
    if (!s) return reply.code(404).send({ error: "not_found" });
    schedules.remove(s.id);
    return reply.code(204).send();
  });
}
