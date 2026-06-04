import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { requireUserId } from "../auth/middleware.js";
import {
  plaidAccounts,
  profileAccountMappings,
  profiles,
  schedules,
} from "../db/queries.js";
import { render } from "../views/render.js";

const createSchema = z.object({
  profileId: z.coerce.number().int().positive(),
  intervalHours: z.coerce.number().int().positive(),
  plaidAccountIds: z.union([z.string(), z.array(z.string())]).optional(),
});

function asArray(v: string | string[] | undefined): string[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

export function registerScheduleRoutes(app: FastifyInstance): void {
  app.get("/schedules", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const ownerProfiles = profiles.listByOwner(userId);
    const profileName = new Map(ownerProfiles.map((p) => [p.id, p.name]));
    const accountName = new Map(
      plaidAccounts.listByOwner(userId).map((a) => [a.plaid_account_id, a.name]),
    );

    const rows = schedules.listByOwner(userId).map((s) => ({
      id: s.id,
      profileName: profileName.get(s.profile_id) ?? `#${s.profile_id}`,
      intervalHours: s.interval_hours,
      enabled: s.enabled === 1,
      lastRunAt: s.last_run_at,
      nextRunAt: s.next_run_at,
      accountNames: (() => {
        try {
          return (JSON.parse(s.plaid_account_ids) as string[]).map(
            (id) => accountName.get(id) ?? id,
          );
        } catch {
          return [];
        }
      })(),
    }));

    // Candidate accounts per profile (its mapped accounts) for the create form.
    const profileOptions = ownerProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      accounts: profileAccountMappings
        .listByProfile(p.id)
        .map((m) => ({ id: m.plaid_account_id, name: accountName.get(m.plaid_account_id) ?? m.plaid_account_id })),
    }));

    return render(reply, "schedules", {
      title: "Schedules",
      authed: true,
      schedules: rows,
      profiles: profileOptions,
      error: null,
    });
  });

  app.post("/schedules", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_schedule" });

    const profile = profiles.getOwned(parsed.data.profileId, userId);
    if (!profile) return reply.code(404).send({ error: "profile_not_found" });

    // Keep only accounts actually mapped in that profile and owned by the user.
    const mapped = new Set(
      profileAccountMappings.listByProfile(profile.id).map((m) => m.plaid_account_id),
    );
    const accountIds = asArray(parsed.data.plaidAccountIds).filter((id) => mapped.has(id));
    if (accountIds.length === 0) return reply.code(400).send({ error: "no_accounts_selected" });

    schedules.create({
      ownerUserId: userId,
      profileId: profile.id,
      plaidAccountIds: accountIds,
      intervalHours: parsed.data.intervalHours,
      nextRunAt: Date.now() + parsed.data.intervalHours * 3600_000,
    });
    reply.redirect("/schedules");
  });

  app.post<{ Params: { id: string }; Body: { enabled?: string } }>(
    "/schedules/:id/toggle",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;
      const s = schedules.getOwned(Number.parseInt(req.params.id, 10), userId);
      if (!s) return reply.code(404).send({ error: "not_found" });
      schedules.setEnabled(s.id, s.enabled !== 1);
      reply.redirect("/schedules");
    },
  );

  app.post<{ Params: { id: string } }>("/schedules/:id/delete", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;
    const s = schedules.getOwned(Number.parseInt(req.params.id, 10), userId);
    if (!s) return reply.code(404).send({ error: "not_found" });
    schedules.remove(s.id);
    return reply.code(204).send();
  });
}
