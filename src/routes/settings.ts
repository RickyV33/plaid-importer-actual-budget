import type { FastifyInstance } from "fastify";

import { requireAdmin } from "../auth/middleware.js";
import {
  INITIAL_HISTORY_DAYS_KEY,
  profiles,
  REGISTRATION_SECRET_KEY,
  settings,
  SYNC_RATELIMIT_MAX_KEY,
  SYNC_RATELIMIT_WINDOW_HOURS_KEY,
} from "../db/queries.js";
import {
  effectiveInitialHistoryDays,
  MAX_HISTORY_DAYS,
  MIN_HISTORY_DAYS,
  validateInitialHistoryDays,
} from "../plaid/history.js";
import { render } from "../views/render.js";

function viewData(extra: { saved?: boolean; errorKey?: string | null }) {
  return {
    title: "Settings",
    authed: true,
    isAdmin: true,
    currentSecret: settings.get(REGISTRATION_SECRET_KEY) ?? null,
    syncMax: settings.get(SYNC_RATELIMIT_MAX_KEY) ?? "",
    syncWindowHours: settings.get(SYNC_RATELIMIT_WINDOW_HOURS_KEY) ?? "",
    // Always a valid in-range number: the view shows the window actually in
    // effect, which is the default whenever the row is unset or unparseable.
    initialHistoryDays: effectiveInitialHistoryDays(),
    minHistoryDays: MIN_HISTORY_DAYS,
    maxHistoryDays: MAX_HISTORY_DAYS,
    allProfiles: profiles.listAllWithOwner().map((p) => ({
      id: p.id,
      name: p.name,
      owner: p.owner_username,
      serverUrl: p.server_url,
      budgetId: p.budget_id,
    })),
    saved: extra.saved ?? false,
    errorKey: extra.errorKey ?? null,
  };
}

export function registerSettingsRoutes(app: FastifyInstance): void {
  app.get("/settings", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    return render(reply, "settings", viewData({}));
  });

  app.post<{ Body: { registration_secret?: string } }>("/settings", async (req, reply) => {
    if (!requireAdmin(req, reply)) return;
    const secret = (req.body.registration_secret ?? "").trim();
    if (secret.length === 0) {
      return render(reply.code(400), "settings", viewData({ errorKey: "settings.errSecretEmpty" }));
    }
    settings.set(REGISTRATION_SECRET_KEY, secret);
    return render(reply, "settings", viewData({ saved: true }));
  });

  app.post<{ Body: { sync_max?: string; sync_window_hours?: string } }>(
    "/settings/sync-limit",
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const maxRaw = (req.body.sync_max ?? "").trim();
      const windowRaw = (req.body.sync_window_hours ?? "").trim();

      // Blank/0 either field disables the ceiling.
      const disabled = maxRaw === "" || windowRaw === "" || maxRaw === "0" || windowRaw === "0";
      if (!disabled) {
        const max = Number(maxRaw);
        const wh = Number(windowRaw);
        if (!Number.isInteger(max) || max < 0 || !Number.isInteger(wh) || wh < 0) {
          return render(reply.code(400), "settings", viewData({ errorKey: "settings.errSyncInvalid" }));
        }
      }
      settings.set(SYNC_RATELIMIT_MAX_KEY, disabled ? "" : maxRaw);
      settings.set(SYNC_RATELIMIT_WINDOW_HOURS_KEY, disabled ? "" : windowRaw);
      return render(reply, "settings", viewData({ saved: true }));
    },
  );

  app.post<{ Body: { initial_history_days?: string } }>(
    "/settings/initial-history",
    async (req, reply) => {
      if (!requireAdmin(req, reply)) return;
      const days = validateInitialHistoryDays(req.body.initial_history_days ?? "");
      if (days === null) {
        return render(
          reply.code(400),
          "settings",
          viewData({ errorKey: "settings.errHistoryInvalid" }),
        );
      }
      settings.set(INITIAL_HISTORY_DAYS_KEY, String(days));
      return render(reply, "settings", viewData({ saved: true }));
    },
  );
}
