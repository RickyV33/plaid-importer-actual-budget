import type { FastifyInstance } from "fastify";
import { requireUserId } from "../auth/middleware.js";
import { dismissedBanners } from "../db/queries.js";

export function registerBannerRoutes(app: FastifyInstance): void {
  app.post<{ Params: { key: string } }>("/banners/:key/dismiss", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    dismissedBanners.insert(userId, req.params.key);
    return reply.code(204).send();
  });
}
