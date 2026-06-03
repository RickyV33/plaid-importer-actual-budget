import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { listAccounts } from "../actual/accounts.js";
import { requireUserId } from "../auth/middleware.js";
import { accountMappings, plaidAccounts } from "../db/queries.js";

export function registerAccountRoutes(app: FastifyInstance): void {
  app.get("/accounts/actual", async (_req, reply) => {
    try {
      const accounts = await listAccounts();
      return reply.send(accounts);
    } catch (err) {
      app.log.error({ err }, "actual_accounts_fetch_failed");
      return reply.code(502).send({ error: "actual_unreachable" });
    }
  });

  app.post<{
    Params: { plaidAccountId: string };
    Body: { actualAccountId?: string };
  }>("/accounts/:plaidAccountId/mapping", async (req, reply) => {
    const { plaidAccountId } = req.params;
    const actualAccountId = req.body.actualAccountId;

    if (typeof actualAccountId !== "string" || actualAccountId.length === 0) {
      return reply.code(400).send({ error: "actualAccountId required" });
    }

    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const plaidAcct = plaidAccounts.getByPlaidIdOwned(plaidAccountId, userId);
    if (!plaidAcct) {
      return reply.code(404).send({ error: "plaid_account_not_found" });
    }

    let actualAccounts;
    try {
      actualAccounts = await listAccounts();
    } catch (err) {
      app.log.error({ err }, "actual_accounts_fetch_failed");
      return reply.code(502).send({ error: "actual_unreachable" });
    }

    const match = actualAccounts.find((a) => a.id === actualAccountId);
    if (!match) {
      return reply.code(400).send({ error: "actual_account_not_found" });
    }

    accountMappings.upsert({
      plaidAccountId,
      actualAccountId: match.id,
      actualAccountName: match.name,
    });

    return reply.send({ ok: true });
  });

  app.delete<{ Params: { plaidAccountId: string } }>(
    "/accounts/:plaidAccountId/mapping",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      if (!plaidAccounts.getByPlaidIdOwned(req.params.plaidAccountId, userId)) {
        return reply.code(404).send({ error: "plaid_account_not_found" });
      }
      accountMappings.remove(req.params.plaidAccountId);
      return reply.code(204).send();
    },
  );

  const pendingVisibleSchema = z.object({ value: z.boolean() });

  app.post<{ Params: { plaidAccountId: string } }>(
    "/accounts/:plaidAccountId/mapping/pending-visible",
    async (req, reply) => {
      const parsed = pendingVisibleSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "invalid_body" });
      }
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      if (!plaidAccounts.getByPlaidIdOwned(req.params.plaidAccountId, userId)) {
        return reply.code(404).send({ error: "plaid_account_not_found" });
      }
      const changed = accountMappings.setPendingVisible(
        req.params.plaidAccountId,
        parsed.data.value,
      );
      if (changed === 0) {
        return reply.code(404).send({ error: "mapping_not_found" });
      }
      return reply.send({ ok: true, pendingVisible: parsed.data.value });
    },
  );
}
