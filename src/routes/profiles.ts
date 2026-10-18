import path from "node:path";

import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "../config.js";
import { connectionForProfile, listBudgets, profileCacheDir } from "../actual/client.js";
import { invalidateAccountsCache, listAccountsForProfile } from "../actual/accounts.js";
import { requireAdmin, requireUserId } from "../auth/middleware.js";
import {
  plaidAccounts,
  plaidTxnEvents,
  profileAccountMappings,
  profileItemDelivery,
  profiles,
} from "../db/queries.js";
import { assertSafeServerUrl } from "../profiles/hostname.js";

export function registerProfileRoutes(app: FastifyInstance): void {
  // Fetch the budgets available on a server, for the dynamic dropdown. A blank
  // password falls back to the configured ACTUAL_SERVER_PASSWORD (server-side,
  // never echoed), so the env-default case works without exposing the secret.
  const budgetsBody = z.object({
    serverUrl: z.string().min(1),
    serverPassword: z.string().optional().default(""),
  });
  app.post("/profiles/budgets", async (req, reply) => {
    if (requireUserId(req, reply) === undefined) return;
    const parsed = budgetsBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
    const serverPassword =
      parsed.data.serverPassword.length > 0
        ? parsed.data.serverPassword
        : config.ACTUAL_SERVER_PASSWORD ?? "";
    if (serverPassword.length === 0) return reply.code(400).send({ error: "password_required" });
    try {
      await assertSafeServerUrl(parsed.data.serverUrl, { blockPrivate: config.blockPrivateActualHosts });
    } catch {
      return reply.code(400).send({ error: "invalid_url" });
    }
    try {
      const budgets = await listBudgets({
        serverUrl: parsed.data.serverUrl,
        serverPassword,
        cacheDir: path.join(config.ACTUAL_CACHE_DIR, "_budgetlist"),
      });
      return reply.send({ budgets });
    } catch (err) {
      app.log.warn({ err }, "list_budgets_failed");
      return reply.code(502).send({ error: "unreachable" });
    }
  });

  // Admin-only: delete any user's profile (oversight).
  app.post<{ Params: { id: string } }>("/admin/profiles/:id/delete", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const id = Number.parseInt(req.params.id, 10);
    if (!profiles.get(id)) return reply.code(404).send({ error: "not_found" });
    profiles.remove(id);
    invalidateAccountsCache(id);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/profiles/:id/delete", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    const id = Number.parseInt(req.params.id, 10);
    if (!profiles.getOwned(id, userId)) return reply.code(404).send({ error: "not_found" });
    profiles.remove(id); // cascades mappings + delivery rows
    invalidateAccountsCache(id);
    return reply.code(204).send();
  });

  // --- Per-(profile, account) mapping ---
  const mapBody = z.object({ actualAccountId: z.string().min(1) });

  app.post<{ Params: { id: string; plaidAccountId: string } }>(
    "/profiles/:id/mappings/:plaidAccountId",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const profileId = Number.parseInt(req.params.id, 10);
      const profile = profiles.getOwned(profileId, userId);
      if (!profile) return reply.code(404).send({ error: "profile_not_found" });
      const acct = plaidAccounts.getByPlaidIdOwned(req.params.plaidAccountId, userId);
      if (!acct) return reply.code(404).send({ error: "account_not_found" });

      const parsed = mapBody.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "actualAccountId required" });

      let actualAccounts;
      try {
        actualAccounts = await listAccountsForProfile(profileId, connectionForProfile(profile));
      } catch {
        return reply.code(502).send({ error: "actual_unreachable" });
      }
      const match = actualAccounts.find((a) => a.id === parsed.data.actualAccountId);
      if (!match) return reply.code(400).send({ error: "actual_account_not_found" });

      profileAccountMappings.upsert({
        profileId,
        plaidAccountId: acct.plaid_account_id,
        actualAccountId: match.id,
        actualAccountName: match.name,
      });
      // Late-join: start delivery at the journal head so the profile only gets
      // transactions pulled after it was attached.
      profileItemDelivery.ensure(profileId, acct.item_id, plaidTxnEvents.maxEventIdForItem(acct.item_id));
      return reply.send({ ok: true });
    },
  );

  app.delete<{ Params: { id: string; plaidAccountId: string } }>(
    "/profiles/:id/mappings/:plaidAccountId",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const profileId = Number.parseInt(req.params.id, 10);
      const profile = profiles.getOwned(profileId, userId);
      if (!profile) return reply.code(404).send({ error: "profile_not_found" });
      const acct = plaidAccounts.getByPlaidIdOwned(req.params.plaidAccountId, userId);
      if (!acct) return reply.code(404).send({ error: "account_not_found" });

      profileAccountMappings.remove(profileId, acct.plaid_account_id);
      // If the profile no longer maps any account of this item, drop its delivery
      // row so its watermark cannot pin the journal.
      const remaining = profileAccountMappings.listForProfileAndItem(profileId, acct.item_id);
      if (remaining.length === 0) {
        profileItemDelivery.deleteForProfileItem(profileId, acct.item_id);
      }
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string; plaidAccountId: string } }>(
    "/profiles/:id/mappings/:plaidAccountId/pending-visible",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const profileId = Number.parseInt(req.params.id, 10);
      if (!profiles.getOwned(profileId, userId)) return reply.code(404).send({ error: "profile_not_found" });
      const acct = plaidAccounts.getByPlaidIdOwned(req.params.plaidAccountId, userId);
      if (!acct) return reply.code(404).send({ error: "account_not_found" });
      const parsed = z.object({ value: z.boolean() }).safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid_body" });
      const changed = profileAccountMappings.setPendingVisible(profileId, acct.plaid_account_id, parsed.data.value);
      if (changed === 0) return reply.code(404).send({ error: "mapping_not_found" });
      return reply.send({ ok: true, pendingVisible: parsed.data.value });
    },
  );

  void profileCacheDir;
}
