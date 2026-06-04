import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { config } from "../config.js";
import { connectionForProfile, profileCacheDir } from "../actual/client.js";
import { invalidateAccountsCache, listAccountsForProfile } from "../actual/accounts.js";
import { requireUserId } from "../auth/middleware.js";
import { encrypt } from "../crypto/tokens.js";
import {
  plaidAccounts,
  plaidTxnEvents,
  profileAccountMappings,
  profileItemDelivery,
  profiles,
} from "../db/queries.js";
import { assertSafeServerUrl, UnsafeServerUrlError } from "../profiles/hostname.js";
import { render } from "../views/render.js";

const profileSchema = z.object({
  name: z.string().min(1),
  serverUrl: z.string().min(1),
  budgetId: z.string().min(1),
  serverPassword: z.string().optional().default(""),
  encryptionPassword: z.string().optional().default(""),
});

export function registerProfileRoutes(app: FastifyInstance): void {
  app.get("/profiles/new", async (req, reply) => {
    if (requireUserId(req, reply) === undefined) return;
    return render(reply, "profile_form", { title: "New profile", authed: true, profile: null, error: null });
  });

  app.get<{ Params: { id: string } }>("/profiles/:id/edit", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    const profile = profiles.getOwned(Number.parseInt(req.params.id, 10), userId);
    if (!profile) return reply.code(404).send({ error: "not_found" });
    return render(reply, "profile_form", { title: "Edit profile", authed: true, profile, error: null });
  });

  app.post("/profiles", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return render(reply.code(400), "profile_form", { title: "New profile", authed: true, profile: null, error: "All fields except encryption password are required." });
    }
    const d = parsed.data;
    if (d.serverPassword.length === 0) {
      return render(reply.code(400), "profile_form", { title: "New profile", authed: true, profile: null, error: "Server password is required." });
    }
    try {
      await assertSafeServerUrl(d.serverUrl, { blockPrivate: config.blockPrivateActualHosts });
    } catch (err) {
      const msg = err instanceof UnsafeServerUrlError ? err.message : "Invalid server URL.";
      return render(reply.code(400), "profile_form", { title: "New profile", authed: true, profile: null, error: msg });
    }
    if (profiles.findByOwnerServerBudget(userId, d.serverUrl, d.budgetId)) {
      return render(reply.code(409), "profile_form", { title: "New profile", authed: true, profile: null, error: "You already have a profile for this server and budget." });
    }
    profiles.create({
      ownerUserId: userId,
      name: d.name,
      serverUrl: d.serverUrl,
      budgetId: d.budgetId,
      serverPasswordEnc: encrypt(d.serverPassword),
      encryptionPasswordEnc: d.encryptionPassword.length > 0 ? encrypt(d.encryptionPassword) : null,
    });
    reply.redirect("/");
  });

  app.post<{ Params: { id: string } }>("/profiles/:id", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    const id = Number.parseInt(req.params.id, 10);
    const existing = profiles.getOwned(id, userId);
    if (!existing) return reply.code(404).send({ error: "not_found" });

    const parsed = profileSchema.safeParse(req.body);
    if (!parsed.success) {
      return render(reply.code(400), "profile_form", { title: "Edit profile", authed: true, profile: existing, error: "Name, server URL and budget id are required." });
    }
    const d = parsed.data;
    try {
      await assertSafeServerUrl(d.serverUrl, { blockPrivate: config.blockPrivateActualHosts });
    } catch (err) {
      const msg = err instanceof UnsafeServerUrlError ? err.message : "Invalid server URL.";
      return render(reply.code(400), "profile_form", { title: "Edit profile", authed: true, profile: existing, error: msg });
    }
    const dup = profiles.findByOwnerServerBudget(userId, d.serverUrl, d.budgetId);
    if (dup && dup.id !== id) {
      return render(reply.code(409), "profile_form", { title: "Edit profile", authed: true, profile: existing, error: "You already have another profile for this server and budget." });
    }
    // Blank secret fields keep the existing stored values.
    profiles.update(id, {
      name: d.name,
      serverUrl: d.serverUrl,
      budgetId: d.budgetId,
      serverPasswordEnc: d.serverPassword.length > 0 ? encrypt(d.serverPassword) : undefined,
      encryptionPasswordEnc: d.encryptionPassword.length > 0 ? encrypt(d.encryptionPassword) : undefined,
    });
    invalidateAccountsCache(id);
    reply.redirect("/");
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
