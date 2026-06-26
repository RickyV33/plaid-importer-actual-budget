import type { FastifyInstance } from "fastify";

import { requireUserId } from "../auth/middleware.js";
import { decrypt, encrypt } from "../crypto/tokens.js";
import { plaidItems, plaidAccounts } from "../db/queries.js";
import {
  createAccountSelectLinkToken,
  createLinkToken,
  createUpdateLinkToken,
  exchangePublicToken,
  fetchAccounts,
  removeItem,
} from "../plaid/link.js";
import { classifyPlaidError } from "../plaid/sync.js";
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

    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    try {
      const result = await exchangePublicToken(publicToken);

      plaidItems.upsert({
        id: result.itemId,
        institutionId: result.institutionId,
        institutionName: result.institutionName,
        accessTokenEnc: encrypt(result.accessToken),
        ownerUserId: userId,
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
          persistentAccountId: acct.persistent_account_id ?? null,
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
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const item = plaidItems.getOwned(req.params.itemId, userId);
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
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const item = plaidItems.getOwned(req.params.itemId, userId);
      if (!item) {
        return reply.code(404).send({ error: "item_not_found" });
      }
      plaidItems.setStatus(item.id, "active");
      return reply.send({ ok: true });
    },
  );

  app.post<{ Params: { itemId: string } }>(
    "/link/items/:itemId/account-select-token",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const item = plaidItems.getOwned(req.params.itemId, userId);
      if (!item) return reply.code(404).send({ error: "item_not_found" });
      try {
        const accessToken = decrypt(item.access_token_enc);
        const { link_token } = await createAccountSelectLinkToken(accessToken);
        return reply.send({ link_token });
      } catch (err) {
        app.log.error({ err, itemId: item.id }, "account_select_token_failed");
        return reply.code(502).send({ error: "plaid_link_token_failed" });
      }
    },
  );

  app.post<{ Params: { itemId: string } }>(
    "/link/items/:itemId/refresh-accounts",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const item = plaidItems.getOwned(req.params.itemId, userId);
      if (!item) return reply.code(404).send({ error: "item_not_found" });
      try {
        const accessToken = decrypt(item.access_token_enc);
        const accounts = await fetchAccounts(accessToken);
        for (const acct of accounts) {
          plaidAccounts.upsertReconciled({
            itemId: item.id,
            plaidAccountId: acct.account_id,
            name: acct.name,
            officialName: acct.official_name ?? null,
            mask: acct.mask ?? null,
            type: acct.type ?? null,
            subtype: acct.subtype ?? null,
            persistentAccountId: acct.persistent_account_id ?? null,
          });
        }
        plaidAccounts.deselectMissing(item.id, accounts.map((a) => a.account_id));
        return reply.send({ ok: true });
      } catch (err) {
        app.log.error({ err, itemId: item.id }, "refresh_accounts_failed");
        return reply.code(502).send({ error: "plaid_refresh_accounts_failed" });
      }
    },
  );

  app.delete<{ Params: { itemId: string; plaidAccountId: string } }>(
    "/link/items/:itemId/accounts/:plaidAccountId",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const item = plaidItems.getOwned(req.params.itemId, userId);
      if (!item) return reply.code(404).send({ error: "item_not_found" });
      const account = plaidAccounts.getByPlaidIdOwned(req.params.plaidAccountId, userId);
      if (!account || account.item_id !== item.id) {
        return reply.code(404).send({ error: "account_not_found" });
      }
      // Only deselected (not-syncing) accounts may be removed; an active account
      // would simply reappear on the next account refresh.
      if (account.access_status !== "deselected") {
        return reply.code(409).send({ error: "account_not_deselected" });
      }
      plaidAccounts.deleteByPlaidId(account.plaid_account_id);
      return reply.code(204).send();
    },
  );

  app.delete<{ Params: { itemId: string } }>(
    "/link/items/:itemId",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const item = plaidItems.getOwned(req.params.itemId, userId);
      if (!item) {
        return reply.code(404).send({ error: "item_not_found" });
      }
      if (item.status === "removed") {
        return reply.code(204).send();
      }

      try {
        const accessToken = decrypt(item.access_token_enc);
        await removeItem(accessToken);
        plaidItems.setStatus(item.id, "removed");
        return reply.code(204).send();
      } catch (err) {
        const code = classifyPlaidError(err);
        if (code === "ITEM_NOT_FOUND" || code === "INVALID_ACCESS_TOKEN") {
          plaidItems.setStatus(item.id, "removed");
          return reply.code(204).send();
        }
        app.log.error({ err, itemId: item.id }, "item_remove_failed");
        return reply.code(502).send({ error: "plaid_item_remove_failed", code });
      }
    },
  );
}
