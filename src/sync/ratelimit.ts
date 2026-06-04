import {
  settings,
  SYNC_RATELIMIT_MAX_KEY,
  SYNC_RATELIMIT_WINDOW_HOURS_KEY,
} from "../db/queries.js";

export type SyncLimit = { max: number; windowHours: number };

/** The configured per-connection ceiling, or null when disabled/unset. */
export function effectiveSyncLimit(): SyncLimit | null {
  return parseSyncLimit(
    settings.get(SYNC_RATELIMIT_MAX_KEY),
    settings.get(SYNC_RATELIMIT_WINDOW_HOURS_KEY),
  );
}

/** Pure parse/validate so it can be unit-tested without the DB. */
export function parseSyncLimit(
  maxRaw: string | undefined,
  windowRaw: string | undefined,
): SyncLimit | null {
  const max = Number(maxRaw);
  const windowHours = Number(windowRaw);
  if (!Number.isFinite(max) || max <= 0) return null;
  if (!Number.isFinite(windowHours) || windowHours <= 0) return null;
  return { max: Math.floor(max), windowHours };
}

/** Minutes until a connection whose oldest in-window pull was at `oldestTs` frees a slot. */
export function retryAfterMinutes(
  oldestTs: number,
  windowHours: number,
  now: number,
): number {
  const freesAt = oldestTs + windowHours * 3600_000;
  return Math.max(1, Math.ceil((freesAt - now) / 60_000));
}
