// The admin Settings page.

import {
  INITIAL_HISTORY_DAYS_KEY,
  profiles,
  REGISTRATION_SECRET_KEY,
  settings,
  SYNC_RATELIMIT_MAX_KEY,
  SYNC_RATELIMIT_WINDOW_HOURS_KEY,
} from "../db/queries.js";
import { effectiveInitialHistoryDays, MAX_HISTORY_DAYS, MIN_HISTORY_DAYS, validateInitialHistoryDays } from "../plaid/history.js";
import { fail, type Result } from "./result.js";

export type SettingsView = {
  currentSecret: string | null;
  syncMax: string;
  syncWindowHours: string;
  /** Always a valid in-range number: the window actually in effect. */
  initialHistoryDays: number;
  minHistoryDays: number;
  maxHistoryDays: number;
  allProfiles: { id: number; name: string; owner: string; serverUrl: string; budgetId: string }[];
};

export function settingsFor(): SettingsView {
  return {
    currentSecret: settings.get(REGISTRATION_SECRET_KEY) ?? null,
    syncMax: settings.get(SYNC_RATELIMIT_MAX_KEY) ?? "",
    syncWindowHours: settings.get(SYNC_RATELIMIT_WINDOW_HOURS_KEY) ?? "",
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
  };
}

// ── writes (admin) ──────────────────────────────────────────────────

export function setRegistrationSecret(body: unknown): Result {
  const secret = typeof (body as { secret?: unknown })?.secret === "string" ? (body as { secret: string }).secret.trim() : "";
  if (secret.length === 0) return fail(400, "settings.errSecretEmpty");
  settings.set(REGISTRATION_SECRET_KEY, secret);
  return { ok: true };
}

/** Blank or 0 in either field turns the ceiling off. */
export function setSyncLimit(body: unknown): Result {
  const field = (k: string) => String((body as Record<string, unknown> | null)?.[k] ?? "").trim();
  const maxRaw = field("max");
  const windowRaw = field("windowHours");
  const disabled = maxRaw === "" || windowRaw === "" || maxRaw === "0" || windowRaw === "0";
  if (!disabled) {
    const max = Number(maxRaw);
    const wh = Number(windowRaw);
    if (!Number.isInteger(max) || max < 0 || !Number.isInteger(wh) || wh < 0) return fail(400, "settings.errSyncInvalid");
  }
  settings.set(SYNC_RATELIMIT_MAX_KEY, disabled ? "" : maxRaw);
  settings.set(SYNC_RATELIMIT_WINDOW_HOURS_KEY, disabled ? "" : windowRaw);
  return { ok: true };
}

export function setInitialHistory(body: unknown): Result {
  const days = validateInitialHistoryDays(String((body as { days?: unknown } | null)?.days ?? ""));
  if (days === null) return fail(400, "settings.errHistoryInvalid");
  settings.set(INITIAL_HISTORY_DAYS_KEY, String(days));
  return { ok: true };
}
