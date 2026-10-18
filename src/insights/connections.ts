// Per-connection health: how recently it synced and how much of the sync
// ceiling it has used.

import type { SyncLimit } from "../sync/ratelimit.js";

const HOUR_MS = 3_600_000;
const FRESH_MS = 24 * HOUR_MS;
const STALE_MS = 7 * 24 * HOUR_MS;

export type Freshness = "fresh" | "stale" | "old" | "never" | "relink";

/** Relink wins over recency: a connection that can't pull isn't fresh, whatever its last sync. */
export function freshness(item: { status: string; last_synced_at: number | null }, now: number): Freshness {
  if (item.status === "requires_relink") return "relink";
  if (item.last_synced_at === null) return "never";
  const age = now - item.last_synced_at;
  if (age <= FRESH_MS) return "fresh";
  if (age <= STALE_MS) return "stale";
  return "old";
}

export type RateLimitUsage = {
  used: number;
  max: number;
  windowHours: number;
  full: boolean;
  /** When the oldest in-window pull rolls off; only set when the ceiling is reached. */
  freesAt: number | null;
};

/** Null when no ceiling is configured, so there is nothing to meter. */
export function rateLimitUsage(
  used: number,
  oldestInWindow: number | null,
  limit: SyncLimit | null,
  now: number,
): RateLimitUsage | null {
  if (!limit) return null;
  const full = used >= limit.max;
  const freesAt = full && oldestInWindow !== null ? Math.max(now, oldestInWindow + limit.windowHours * HOUR_MS) : null;
  return { used: Math.min(used, limit.max), max: limit.max, windowHours: limit.windowHours, full, freesAt };
}
