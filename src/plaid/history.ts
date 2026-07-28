import { INITIAL_HISTORY_DAYS_KEY, settings } from "../db/queries.js";

/**
 * Plaid's supported bounds for `transactions.days_requested`, and its own
 * default. The window is bound once, at link-token creation: it fixes how much
 * history Plaid ever makes available for that Item. Ongoing syncs are
 * cursor-driven and unaffected by this value.
 */
export const MIN_HISTORY_DAYS = 90;
export const MAX_HISTORY_DAYS = 730;
export const DEFAULT_HISTORY_DAYS = 90;

/** The admin-configured initial history window, or the 90-day default. */
export function effectiveInitialHistoryDays(): number {
  return parseInitialHistoryDays(settings.get(INITIAL_HISTORY_DAYS_KEY));
}

/**
 * Pure parse/validate so it can be unit-tested without the DB. Anything not a
 * whole number inside [90, 730] falls back to the default rather than throwing,
 * so a stale or hand-edited settings row can never break link-token creation.
 */
export function parseInitialHistoryDays(raw: string | undefined): number {
  const days = Number(raw);
  if (!Number.isInteger(days)) return DEFAULT_HISTORY_DAYS;
  if (days < MIN_HISTORY_DAYS || days > MAX_HISTORY_DAYS) return DEFAULT_HISTORY_DAYS;
  return days;
}
