// The Overview page: a read-only, local-only summary. No Plaid or Actual calls.

import {
  plaidAccounts,
  plaidItems,
  profileAccountMappings,
  profiles,
  syncAccountResults,
  syncRuns,
  users,
} from "../db/queries.js";
import { freshness, type Freshness } from "../insights/connections.js";
import { coverage, type Coverage } from "../insights/coverage.js";
import { byConnection, dailySeries, type DayPoint, type ShareRow } from "../insights/imports.js";
import { outcomeSummary, type OutcomeSummary } from "../insights/runs.js";
import { DAY_MS, nextRunByItem } from "./shared.js";

export type ConnectionSync = {
  id: string;
  institutionName: string | null;
  lastSyncedAt: number | null;
  nextRunAt: number | null;
  freshness: Freshness;
};

export type OverviewView = {
  connectionCount: number;
  accountCount: number;
  relinkCount: number;
  connectionSyncs: ConnectionSync[];
  nextSyncAt: number | null;
  importedTotals: { d7: number; d30: number; d60: number; d90: number };
  outcomes: OutcomeSummary;
  daily: DayPoint[];
  byConnection: ShareRow[];
  coverage: Coverage;
  profileCount: number;
  /** Other registered users (excluding the viewing admin); null for non-admins. */
  otherUsers: number | null;
};

export function overviewFor(userId: number, isAdmin: boolean, now: number, tz: string): OverviewView {
  const items = plaidItems.listByOwner(userId);
  const nextByItem = nextRunByItem(userId);
  const userProfiles = profiles.listByOwner(userId);

  // One read of the last 90 days feeds the windowed totals, the success rate,
  // and the per-day chart.
  const runs = syncRuns.listSinceByOwner(userId, now - 90 * DAY_MS);
  const since = (days: number) => runs.filter((r) => r.started_at >= now - days * DAY_MS);
  const importedIn = (days: number) => since(days).reduce((n, r) => n + r.total_imported, 0);

  const connectionSyncs = items.map((item) => ({
    id: item.id,
    institutionName: item.institution_name,
    lastSyncedAt: item.last_synced_at,
    nextRunAt: nextByItem.get(item.id) ?? null,
    freshness: freshness(item, now),
  }));
  const upcoming = connectionSyncs.map((c) => c.nextRunAt).filter((t): t is number => t !== null);

  // An account counts as routed when any of the user's budgets receives it.
  const mapped = new Set(userProfiles.flatMap((p) => profileAccountMappings.listByProfile(p.id).map((m) => m.plaid_account_id)));
  const accounts = plaidAccounts.listByOwnerAll(userId);

  return {
    connectionCount: items.length,
    accountCount: accounts.filter((a) => a.access_status !== "deselected").length,
    relinkCount: items.filter((i) => i.status === "requires_relink").length,
    connectionSyncs,
    nextSyncAt: upcoming.length ? Math.min(...upcoming) : null,
    importedTotals: { d7: importedIn(7), d30: importedIn(30), d60: importedIn(60), d90: importedIn(90) },
    outcomes: outcomeSummary(since(30)),
    daily: dailySeries(runs, 30, now, tz),
    byConnection: byConnection(
      syncAccountResults.importedByItemSince(userId, now - 30 * DAY_MS),
      items.map((i) => ({ id: i.id, label: i.institution_name ?? "?" })),
    ),
    coverage: coverage(accounts, mapped),
    profileCount: userProfiles.length,
    otherUsers: isAdmin ? Math.max(0, users.count() - 1) : null,
  };
}
