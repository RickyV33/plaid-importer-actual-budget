import type { FastifyInstance } from "fastify";

import { decrypt, encrypt } from "../crypto/tokens.js";
import { plaidItems, plaidAccounts } from "../db/queries.js";
import {
  createLinkToken,
  createUpdateLinkToken,
  exchangePublicToken,
} from "../plaid/link.js";
import { render } from "../views/render.js";

export function registerLinkRoutes(app: FastifyInstance): void {
  app.post("/link/token", async (_req, reply) => {
    try {
      const { link_token } = await createLinkToken();
      return reply.send({ link_token });
    } catch (err) {
      app.log.error({ err }, "link_token_create_failed");
      return reply.code(502).send({ error: "plaid_link_token_failed" });
    }
  });

  app.post<{ Body: { public_token?: string } }>("/link/exchange", async (req, reply) => {
    const publicToken = req.body.public_token;
    if (typeof publicToken !== "string" || publicToken.length === 0) {
      return reply.code(400).send({ error: "public_token required" });
    }

    try {
      const result = await exchangePublicToken(publicToken);

      plaidItems.upsert({
        id: result.itemId,
        institutionId: result.institutionId,
        institutionName: result.institutionName,
        accessTokenEnc: encrypt(result.accessToken),
      });

      for (const acct of result.accounts) {
        plaidAccounts.upsert({
          itemId: result.itemId,
          plaidAccountId: acct.account_id,
          name: acct.name,
          officialName: acct.official_name ?? null,
          mask: acct.mask ?? null,
          type: acct.type ?? null,
          subtype: acct.subtype ?? null,
        });
      }

      return reply.send({ ok: true, item_id: result.itemId });
    } catch (err) {
      app.log.error({ err }, "link_exchange_failed");
      return reply.code(502).send({ error: "plaid_exchange_failed" });
    }
  });

  app.get<{ Querystring: { oauth_state_id?: string } }>(
    "/link/oauth-return",
    async (_req, reply) => {
      return render(reply, "oauth_return", {
        title: "Completing link…",
        authed: true,
      });
    },
  );

  app.post<{ Params: { itemId: string } }>(
    "/link/items/:itemId/update-token",
    async (req, reply) => {
      const item = plaidItems.get(req.params.itemId);
      if (!item) {
        return reply.code(404).send({ error: "item_not_found" });
      }
      try {
        const accessToken = decrypt(item.access_token_enc);
        const { link_token } = await createUpdateLinkToken(accessToken);
        return reply.send({ link_token });
      } catch (err) {
        app.log.error({ err, itemId: item.id }, "update_link_token_failed");
        return reply.code(502).send({ error: "plaid_link_token_failed" });
      }
    },
  );

  app.post<{ Params: { itemId: string } }>(
    "/link/items/:itemId/mark-active",
    async (req, reply) => {
      const item = plaidItems.get(req.params.itemId);
      if (!item) {
        return reply.code(404).send({ error: "item_not_found" });
      }
      plaidItems.setStatus(item.id, "active");
      return reply.send({ ok: true });
    },
  );
}
