import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireUserId } from "../auth/middleware.js";
import { plaidAccounts, plaidItems, syncRuns } from "../db/queries.js";
import { effectiveSyncLimit, retryAfterMinutes } from "../sync/ratelimit.js";
import { runSync } from "../sync/run.js";

const bodySchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("all") }),
  z.object({
    scope: z.literal("selected"),
    plaidAccountIds: z.array(z.string().min(1)).min(1),
  }),
]);

type Skipped = { name: string; retryAfterMinutes: number };

export function registerSyncRoutes(app: FastifyInstance): void {
  app.post("/sync", async (req, reply) => {
    const parsed = bodySchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_scope" });
    }

    const ownerUserId = requireUserId(req, reply);
    if (ownerUserId === undefined) return;

    // Resolve the requested accounts (owned only) and group by connection.
    const owned = plaidAccounts.listByOwner(ownerUserId);
    let requested = owned;
    if (parsed.data.scope === "selected") {
      const ids = new Set(parsed.data.plaidAccountIds);
      requested = owned.filter((a) => ids.has(a.plaid_account_id));
    }

    // Per-connection ceiling (skip over-limit connections, sync the rest).
    const limit = effectiveSyncLimit();
    const skipped: Skipped[] = [];
    let allowed = requested;

    if (limit) {
      const now = Date.now();
      const since = now - limit.windowHours * 3600_000;
      const items = new Map(plaidItems.listByOwner(ownerUserId).map((i) => [i.id, i]));
      const skippedItemIds = new Set<string>();
      const targetItemIds = new Set(requested.map((a) => a.item_id));
      for (const itemId of targetItemIds) {
        if (syncRuns.countPullsForItemSince(itemId, since) >= limit.max) {
          skippedItemIds.add(itemId);
          const oldest = syncRuns.oldestPullForItemSince(itemId, since) ?? now;
          skipped.push({
            name: items.get(itemId)?.institution_name ?? itemId,
            retryAfterMinutes: retryAfterMinutes(oldest, limit.windowHours, now),
          });
        }
      }
      allowed = requested.filter((a) => !skippedItemIds.has(a.item_id));
    }

    if (allowed.length === 0) {
      // Everything was throttled — nothing to run.
      return reply.send({ status: "success", totalImported: 0, runId: null, skipped });
    }

    try {
      const result = await runSync({
        triggeredBy: "manual",
        scope: "selected",
        ownerUserId,
        plaidAccountIds: allowed.map((a) => a.plaid_account_id),
        logger: req.log,
      });
      return reply.send({ ...result, skipped });
    } catch (err) {
      app.log.error({ err }, "sync_run_failed");
      return reply.code(500).send({ error: "sync_failed" });
    }
  });
}
