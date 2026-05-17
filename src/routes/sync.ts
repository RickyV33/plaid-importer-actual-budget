import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { runSync } from "../sync/run.js";

const bodySchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("all") }),
  z.object({
    scope: z.literal("selected"),
    plaidAccountIds: z.array(z.string().min(1)).min(1),
  }),
]);

export function registerSyncRoutes(app: FastifyInstance): void {
  app.post("/sync", async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_scope" });
    }

    try {
      const result =
        parsed.data.scope === "all"
          ? await runSync({ triggeredBy: "manual", scope: "all" })
          : await runSync({
              triggeredBy: "manual",
              scope: "selected",
              plaidAccountIds: parsed.data.plaidAccountIds,
            });

      return reply.send(result);
    } catch (err) {
      app.log.error({ err }, "sync_run_failed");
      return reply.code(500).send({ error: "sync_failed" });
    }
  });
}
