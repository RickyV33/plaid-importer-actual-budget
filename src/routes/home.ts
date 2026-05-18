import type { FastifyInstance } from "fastify";

import { listAccounts } from "../actual/accounts.js";
import {
  accountMappings,
  plaidAccounts,
  plaidItems,
  type PlaidAccountRow,
  type PlaidItemRow,
} from "../db/queries.js";
import { render } from "../views/render.js";

export type HomeAccountView = {
  plaidAccountId: string;
  name: string;
  mask: string | null;
  type: string | null;
  mappedActualName: string | null;
  mappedActualId: string | null;
  pendingVisible: boolean;
};

export type HomeItemView = {
  id: string;
  institutionName: string | null;
  status: string;
  lastSyncedAt: number | null;
  accounts: HomeAccountView[];
};

export function registerHomeRoute(app: FastifyInstance): void {
  app.get("/", async (_req, reply) => {
    const items = plaidItems.listAll();
    const accounts = plaidAccounts.listAll();
    const mappings = new Map(
      accountMappings.listAll().map((m) => [m.plaid_account_id, m]),
    );

    const itemViews: HomeItemView[] = items.map((item) => ({
      id: item.id,
      institutionName: item.institution_name,
      status: item.status,
      lastSyncedAt: item.last_synced_at,
      accounts: accountsForItem(accounts, item).map((acct) => {
        const m = mappings.get(acct.plaid_account_id);
        return {
          plaidAccountId: acct.plaid_account_id,
          name: acct.name,
          mask: acct.mask,
          type: acct.type,
          mappedActualId: m?.actual_account_id ?? null,
          mappedActualName: m?.actual_account_name ?? null,
          pendingVisible: Boolean(m?.pending_visible),
        };
      }),
    }));

    let actualAccounts: { id: string; name: string }[] = [];
    let actualError: string | null = null;
    if (itemViews.some((i) => i.accounts.length > 0)) {
      try {
        actualAccounts = await listAccounts();
      } catch (err) {
        app.log.warn({ err }, "actual_accounts_fetch_failed_home");
        actualError = "Could not reach Actual to load accounts.";
      }
    }

    return render(reply, "home", {
      title: "plaid-importer",
      authed: true,
      items: itemViews,
      actualAccounts,
      actualError,
    });
  });
}

function accountsForItem(all: PlaidAccountRow[], item: PlaidItemRow): PlaidAccountRow[] {
  return all.filter((a) => a.item_id === item.id);
}
