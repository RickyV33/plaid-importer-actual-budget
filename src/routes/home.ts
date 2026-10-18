import type { FastifyInstance } from "fastify";

import { connectionForProfile } from "../actual/client.js";
import { listAccountsForProfile } from "../actual/accounts.js";
import { currentUser, requireUserId } from "../auth/middleware.js";
import {
  plaidAccounts,
  plaidItems,
  profileAccountMappings,
  profiles,
  schedules,
  syncAccountResults,
  syncRuns,
  users,
  type PlaidAccountRow,
  type PlaidItemRow,
} from "../db/queries.js";
import { freshness, rateLimitUsage, type Freshness, type RateLimitUsage } from "../insights/connections.js";
import { coverage } from "../insights/coverage.js";
import { byConnection, dailySeries } from "../insights/imports.js";
import { outcomeSummary } from "../insights/runs.js";
import { effectiveSyncLimit } from "../sync/ratelimit.js";
import { render, viewerTimeZone } from "../views/render.js";

const DAY_MS = 86_400_000;

type HomeAccount = {
  plaidAccountId: string;
  name: string;
  mask: string | null;
  type: string | null;
  accessStatus: "active" | "deselected";
};

type ConnectionAccountView = HomeAccount & {
  /** How many of the user's budgets this account feeds. */
  budgets: number;
  imported30: number;
};

type HomeItemView = {
  id: string;
  institutionName: string | null;
  status: string;
  lastSyncedAt: number | null;
  freshness: Freshness;
  rateLimit: RateLimitUsage | null;
  accounts: ConnectionAccountView[];
};

type ProfileAccountView = HomeAccount & {
  mappedActualId: string | null;
  pendingVisible: boolean;
};

type ProfileConnectionView = {
  itemId: string;
  institutionName: string | null;
  accounts: ProfileAccountView[];
};

type ProfileView = {
  id: number;
  name: string;
  serverUrl: string;
  budgetId: string;
  actualError: boolean;
  actualAccounts: { id: string; name: string }[];
  connections: ProfileConnectionView[];
};

export function registerHomeRoute(app: FastifyInstance): void {
  // Landing dashboard: a read-only, local-only summary. No Plaid or Actual calls.
  app.get("/", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const items = plaidItems.listByOwner(userId);

    // Next scheduled sync per connection: the soonest next_run_at among the
    // owner's enabled schedules that target that connection.
    const nextByItem = new Map<string, number>();
    for (const s of schedules.listByOwner(userId)) {
      if (s.enabled !== 1 || s.next_run_at === null) continue;
      let targeted: string[];
      try {
        targeted = JSON.parse(s.plaid_item_ids) as string[];
      } catch {
        continue;
      }
      for (const id of targeted) {
        const prev = nextByItem.get(id);
        if (prev === undefined || s.next_run_at < prev) nextByItem.set(id, s.next_run_at);
      }
    }

    const now = Date.now();
    const tz = viewerTimeZone(req);
    const isAdmin = currentUser(req)?.role === "admin";
    const userProfiles = profiles.listByOwner(userId);

    // One read of the last 90 days feeds the windowed totals, the success rate,
    // and the per-day chart.
    const runs = syncRuns.listSinceByOwner(userId, now - 90 * DAY_MS);
    const since = (days: number) => runs.filter((r) => r.started_at >= now - days * DAY_MS);
    const importedIn = (days: number) => since(days).reduce((n, r) => n + r.total_imported, 0);
    const importedTotals = { d7: importedIn(7), d30: importedIn(30), d60: importedIn(60), d90: importedIn(90) };

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

    return render(reply, "dashboard", {
      title: "plaid-importer",
      authed: true,
      isAdmin,
      connectionCount: items.length,
      accountCount: accounts.filter((a) => a.access_status !== "deselected").length,
      relinkCount: items.filter((i) => i.status === "requires_relink").length,
      connectionSyncs,
      nextSyncAt: upcoming.length ? Math.min(...upcoming) : null,
      importedTotals,
      outcomes: outcomeSummary(since(30)),
      daily: dailySeries(runs, 30, now, tz),
      byConnection: byConnection(
        syncAccountResults.importedByItemSince(userId, now - 30 * DAY_MS),
        items.map((i) => ({ id: i.id, label: i.institution_name ?? "?" })),
      ),
      coverage: coverage(accounts, mapped),
      profileCount: userProfiles.length,
      // Other registered users (excluding the viewing admin); null for non-admins.
      otherUsers: isAdmin ? Math.max(0, users.count() - 1) : null,
    });
  });

  // Connections page: builds only item views — no per-profile Actual lookups.
  app.get("/connections", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const items = plaidItems.listByOwner(userId);
    const accounts = plaidAccounts.listByOwnerAll(userId);
    const now = Date.now();
    const limit = effectiveSyncLimit();
    const windowStart = limit ? now - limit.windowHours * 3_600_000 : now;
    const imported = new Map(
      syncAccountResults.importedByAccountSince(userId, now - 30 * DAY_MS).map((r) => [r.plaid_account_id, r.imported]),
    );
    const ownProfiles = new Set(profiles.listByOwner(userId).map((p) => p.id));

    const itemViews: HomeItemView[] = items.map((item) => ({
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
        ...toHomeAccount(a),
        budgets: profileAccountMappings.listByPlaidAccount(a.plaid_account_id).filter((m) => ownProfiles.has(m.profile_id)).length,
        imported30: imported.get(a.plaid_account_id) ?? 0,
      })),
    }));

    return render(reply, "connections", {
      title: "plaid-importer",
      authed: true,
      isAdmin: currentUser(req)?.role === "admin",
      items: itemViews,
    });
  });

  // Profiles page: builds profile views, including the per-profile Actual fetch
  // needed to populate the account-mapping selects.
  app.get("/profiles", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const items = plaidItems.listByOwner(userId);
    const accounts = plaidAccounts.listByOwnerAll(userId);

    const profileViews: ProfileView[] = [];
    for (const p of profiles.listByOwner(userId)) {
      const mappings = new Map(
        profileAccountMappings.listByProfile(p.id).map((m) => [m.plaid_account_id, m]),
      );
      let actualAccounts: { id: string; name: string }[] = [];
      let actualError = false;
      if (accounts.length > 0) {
        try {
          actualAccounts = await listAccountsForProfile(p.id, connectionForProfile(p));
        } catch (err) {
          app.log.warn({ err, profileId: p.id }, "actual_accounts_fetch_failed_profiles");
          actualError = true;
        }
      }
      profileViews.push({
        id: p.id,
        name: p.name,
        serverUrl: p.server_url,
        budgetId: p.budget_id,
        actualError,
        actualAccounts,
        connections: items
          .map((item) => ({
            itemId: item.id,
            institutionName: item.institution_name,
            accounts: accountsForItem(accounts, item).map((a) => {
              const m = mappings.get(a.plaid_account_id);
              return {
                ...toHomeAccount(a),
                mappedActualId: m?.actual_account_id ?? null,
                pendingVisible: Boolean(m?.pending_visible),
              };
            }),
          }))
          .filter((c) => c.accounts.length > 0),
      });
    }

    return render(reply, "profiles", {
      title: "plaid-importer",
      authed: true,
      isAdmin: currentUser(req)?.role === "admin",
      profiles: profileViews,
    });
  });
}

function toHomeAccount(a: PlaidAccountRow): HomeAccount {
  return { plaidAccountId: a.plaid_account_id, name: a.name, mask: a.mask, type: a.type, accessStatus: a.access_status };
}

function accountsForItem(all: PlaidAccountRow[], item: PlaidItemRow): PlaidAccountRow[] {
  return all.filter((a) => a.item_id === item.id);
}
