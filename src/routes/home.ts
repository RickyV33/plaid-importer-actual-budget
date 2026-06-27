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
  syncRuns,
  users,
  type PlaidAccountRow,
  type PlaidItemRow,
} from "../db/queries.js";
import { render } from "../views/render.js";

type HomeAccount = {
  plaidAccountId: string;
  name: string;
  mask: string | null;
  type: string | null;
  accessStatus: "active" | "deselected";
};

type HomeItemView = {
  id: string;
  institutionName: string | null;
  status: string;
  lastSyncedAt: number | null;
  accounts: HomeAccount[];
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

    const connectionSyncs = items.map((item) => ({
      institutionName: item.institution_name,
      lastSyncedAt: item.last_synced_at,
      nextRunAt: nextByItem.get(item.id) ?? null,
    }));

    // Imported-transaction totals over rolling windows (sum of total_imported).
    const now = Date.now();
    const day = 86_400_000;
    const importedTotals = {
      d7: syncRuns.totalImportedSince(userId, now - 7 * day),
      d30: syncRuns.totalImportedSince(userId, now - 30 * day),
      d60: syncRuns.totalImportedSince(userId, now - 60 * day),
      d90: syncRuns.totalImportedSince(userId, now - 90 * day),
    };

    const isAdmin = currentUser(req)?.role === "admin";

    return render(reply, "dashboard", {
      title: "plaid-importer",
      authed: true,
      isAdmin,
      connectionCount: items.length,
      relinkCount: items.filter((i) => i.status === "requires_relink").length,
      connectionSyncs,
      importedTotals,
      profileCount: profiles.listByOwner(userId).length,
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

    const itemViews: HomeItemView[] = items.map((item) => ({
      id: item.id,
      institutionName: item.institution_name,
      status: item.status,
      lastSyncedAt: item.last_synced_at,
      accounts: accountsForItem(accounts, item).map(toHomeAccount),
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
