import type { FastifyInstance } from "fastify";

import { currentUser, requireUserId } from "../auth/middleware.js";
import { acknowledgeOrphan, clampOffset, historyFor, orphansFor } from "../api/history.js";
import { render, renderPartial, viewerTimeZone } from "../views/render.js";

export function registerHistoryRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { offset?: string } }>("/history", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const view = historyFor(userId, clampOffset(req.query.offset), Date.now(), viewerTimeZone(req));

    return render(reply, "history", {
      title: "Sync history",
      authed: true,
      isAdmin: currentUser(req)?.role === "admin",
      ...view,
    });
  });

  app.post<{ Params: { id: string } }>(
    "/history/orphans/:id/ack",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;

      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id < 1) {
        return reply.code(404).send({ error: "not_found" });
      }

      if (!acknowledgeOrphan(userId, id)) {
        return reply.code(404).send({ error: "not_found" });
      }
      const orphans = orphansFor(userId);

      const html = renderPartial("partials/orphan_banner", { orphans });
      return reply.type("text/html; charset=utf-8").send(html);
    },
  );
}
