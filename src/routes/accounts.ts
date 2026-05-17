import type { FastifyInstance } from "fastify";

import { listAccounts } from "../actual/accounts.js";
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

    const plaidAcct = plaidAccounts.getByPlaidId(plaidAccountId);
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
      accountMappings.remove(req.params.plaidAccountId);
      return reply.code(204).send();
    },
  );
}
