// The admin Settings page.

import {
  profiles,
  REGISTRATION_SECRET_KEY,
  settings,
  SYNC_RATELIMIT_MAX_KEY,
  SYNC_RATELIMIT_WINDOW_HOURS_KEY,
} from "../db/queries.js";
import { effectiveInitialHistoryDays, MAX_HISTORY_DAYS, MIN_HISTORY_DAYS } from "../plaid/history.js";

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
