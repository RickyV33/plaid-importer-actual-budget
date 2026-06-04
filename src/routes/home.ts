import type { FastifyInstance } from "fastify";

import { connectionForProfile } from "../actual/client.js";
import { listAccountsForProfile } from "../actual/accounts.js";
import { currentUser, requireUserId } from "../auth/middleware.js";
import {
  plaidAccounts,
  plaidItems,
  profileAccountMappings,
  profiles,
  type PlaidAccountRow,
  type PlaidItemRow,
} from "../db/queries.js";
import { render } from "../views/render.js";

type HomeAccount = {
  plaidAccountId: string;
  name: string;
  mask: string | null;
  type: string | null;
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

type ProfileView = {
  id: number;
  name: string;
  serverUrl: string;
  budgetId: string;
  actualError: string | null;
  actualAccounts: { id: string; name: string }[];
  accounts: ProfileAccountView[];
};

export function registerHomeRoute(app: FastifyInstance): void {
  app.get("/", async (req, reply) => {
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const items = plaidItems.listByOwner(userId);
    const accounts = plaidAccounts.listByOwner(userId);

    const itemViews: HomeItemView[] = items.map((item) => ({
      id: item.id,
      institutionName: item.institution_name,
      status: item.status,
      lastSyncedAt: item.last_synced_at,
      accounts: accountsForItem(accounts, item).map(toHomeAccount),
    }));

    const profileViews: ProfileView[] = [];
    for (const p of profiles.listByOwner(userId)) {
      const mappings = new Map(
        profileAccountMappings.listByProfile(p.id).map((m) => [m.plaid_account_id, m]),
      );
      let actualAccounts: { id: string; name: string }[] = [];
      let actualError: string | null = null;
      if (accounts.length > 0) {
        try {
          actualAccounts = await listAccountsForProfile(p.id, connectionForProfile(p));
        } catch (err) {
          app.log.warn({ err, profileId: p.id }, "actual_accounts_fetch_failed_home");
          actualError = "Could not reach this profile's Actual server.";
        }
      }
      profileViews.push({
        id: p.id,
        name: p.name,
        serverUrl: p.server_url,
        budgetId: p.budget_id,
        actualError,
        actualAccounts,
        accounts: accounts.map((a) => {
          const m = mappings.get(a.plaid_account_id);
          return {
            ...toHomeAccount(a),
            mappedActualId: m?.actual_account_id ?? null,
            pendingVisible: Boolean(m?.pending_visible),
          };
        }),
      });
    }

    return render(reply, "home", {
      title: "plaid-importer",
      authed: true,
      isAdmin: currentUser(req)?.role === "admin",
      items: itemViews,
      profiles: profileViews,
    });
  });
}

function toHomeAccount(a: PlaidAccountRow): HomeAccount {
  return { plaidAccountId: a.plaid_account_id, name: a.name, mask: a.mask, type: a.type };
}

function accountsForItem(all: PlaidAccountRow[], item: PlaidItemRow): PlaidAccountRow[] {
  return all.filter((a) => a.item_id === item.id);
}
