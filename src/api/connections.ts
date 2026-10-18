// The Connections page: each bank with its health and accounts. Local only; the
// page's actions call the Plaid endpoints in routes/link.ts and routes/sync.ts.

import {
  plaidAccounts,
  plaidItems,
  profileAccountMappings,
  profiles,
  syncAccountResults,
  syncRuns,
} from "../db/queries.js";
import { freshness, rateLimitUsage, type Freshness, type RateLimitUsage } from "../insights/connections.js";
import { effectiveSyncLimit } from "../sync/ratelimit.js";
import { accountsForItem, DAY_MS, toAccountView, type AccountView } from "./shared.js";

export type ConnectionAccountView = AccountView & {
  /** How many of the user's budgets this account feeds. */
  budgets: number;
  imported30: number;
};

export type ConnectionView = {
  id: string;
  institutionName: string | null;
  status: string;
  lastSyncedAt: number | null;
  freshness: Freshness;
  rateLimit: RateLimitUsage | null;
  accounts: ConnectionAccountView[];
};

export type ConnectionsView = { items: ConnectionView[] };

export function connectionsFor(userId: number, now: number): ConnectionsView {
  const items = plaidItems.listByOwner(userId);
  const accounts = plaidAccounts.listByOwnerAll(userId);
  const limit = effectiveSyncLimit();
  const windowStart = limit ? now - limit.windowHours * 3_600_000 : now;
  const imported = new Map(
    syncAccountResults.importedByAccountSince(userId, now - 30 * DAY_MS).map((r) => [r.plaid_account_id, r.imported]),
  );
  const ownProfiles = new Set(profiles.listByOwner(userId).map((p) => p.id));

  return {
    items: items.map((item) => ({
      id: item.id,
      institutionName: item.institution_name,
      status: item.status,
      lastSyncedAt: item.last_synced_at,
      freshness: freshness(item, now),
      rateLimit: limit
        ? rateLimitUsage(
            syncRuns.countPullsForItemSince(item.id, windowStart),
            syncRuns.oldestPullForItemSince(item.id, windowStart),
            limit,
            now,
          )
        : null,
      accounts: accountsForItem(accounts, item).map((a) => ({
        ...toAccountView(a),
        budgets: profileAccountMappings.listByPlaidAccount(a.plaid_account_id).filter((m) => ownProfiles.has(m.profile_id)).length,
        imported30: imported.get(a.plaid_account_id) ?? 0,
      })),
    })),
  };
}
