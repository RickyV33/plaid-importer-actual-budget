import type { Transaction } from "plaid";

import { withActual } from "../actual/client.js";
import { importBatch } from "../actual/import.js";
import { decrypt } from "../crypto/tokens.js";
import {
  accountMappings,
  plaidAccounts,
  plaidItems,
  syncAccountResults,
  syncRuns,
  type AccountMappingRow,
  type PlaidAccountRow,
  type PlaidItemRow,
} from "../db/queries.js";
import { classifyPlaidError, syncItem } from "../plaid/sync.js";
import {
  processRemovals,
  shouldImportTxn,
  type PendingRemoval,
  type RunLogger,
} from "./lifecycle.js";

export type Scope = "all" | "selected";
export type TriggeredBy = "manual" | "scheduled";

export type RunSyncArgs = {
  triggeredBy: TriggeredBy;
  scope: Scope;
  plaidAccountIds?: string[];
  logger?: RunLogger;
};

export type RunSyncResult = {
  runId: number;
  status: "success" | "failure";
  totalImported: number;
};

type PerAccount = {
  plaidAccountId: string;
  mapping: AccountMappingRow | undefined;
  account: PlaidAccountRow;
  item: PlaidItemRow;
};

const NOOP_LOGGER: RunLogger = { warn: () => {} };

export async function runSync(args: RunSyncArgs): Promise<RunSyncResult> {
  const log = args.logger ?? NOOP_LOGGER;
  const runId = syncRuns.start({ triggeredBy: args.triggeredBy, scope: args.scope });

  const targets = collectTargets(args);
  if (targets.length === 0) {
    syncRuns.finish({ id: runId, status: "success", totalImported: 0 });
    return { runId, status: "success", totalImported: 0 };
  }

  const targetsByItem = groupByItem(targets);
  const pulled = new Map<string, Transaction[]>();
  const removalsByActualAccount = new Map<string, PendingRemoval[]>();
  const itemErrors = new Map<string, string>();

  for (const [itemId, group] of targetsByItem.entries()) {
    const item = group[0]?.item;
    if (!item) continue;

    try {
      const accessToken = decrypt(item.access_token_enc);
      const delta = await syncItem({ accessToken, cursor: item.cursor });

      const targetByPlaidAcct = new Map(
        group.map((g) => [g.plaidAccountId, g] as const),
      );

      const collect = (txn: Transaction) => {
        const target = targetByPlaidAcct.get(txn.account_id);
        if (!target) return;
        if (!shouldImportTxn(target.mapping, txn)) return;
        const list = pulled.get(txn.account_id) ?? [];
        list.push(txn);
        pulled.set(txn.account_id, list);
      };

      for (const txn of delta.added) collect(txn);
      for (const txn of delta.modified) collect(txn);

      for (const removed of delta.removed) {
        const plaidAccountId = removed.account_id;
        if (!plaidAccountId) continue;
        const target = targetByPlaidAcct.get(plaidAccountId);
        if (!target?.mapping) continue;
        const actualAccountId = target.mapping.actual_account_id;
        const list = removalsByActualAccount.get(actualAccountId) ?? [];
        list.push({
          plaidTransactionId: removed.transaction_id,
          plaidAccountId,
          actualAccountId,
          plaidItemId: itemId,
        });
        removalsByActualAccount.set(actualAccountId, list);
      }

      plaidItems.setCursor(itemId, delta.nextCursor);
    } catch (err) {
      const code = classifyPlaidError(err);
      if (code === "ITEM_LOGIN_REQUIRED") {
        plaidItems.setStatus(itemId, "requires_relink");
        itemErrors.set(itemId, "item_login_required");
      } else {
        itemErrors.set(itemId, code);
      }
    }
  }

  let totalImported = 0;
  let anyFailure = false;
  const perAccountOutcomes: Array<{
    plaidAccountId: string;
    status: "success" | "failure" | "skipped";
    txnsImported: number;
    reason: string | null;
  }> = [];

  const importables = targets.filter((t) => {
    const itemErr = itemErrors.get(t.item.id);
    if (itemErr) {
      perAccountOutcomes.push({
        plaidAccountId: t.plaidAccountId,
        status: "failure",
        txnsImported: 0,
        reason: itemErr,
      });
      anyFailure = true;
      return false;
    }
    if (!t.mapping) {
      perAccountOutcomes.push({
        plaidAccountId: t.plaidAccountId,
        status: "skipped",
        txnsImported: 0,
        reason: "unmapped",
      });
      return false;
    }
    return true;
  });

  const hasActualWork =
    importables.length > 0 || removalsByActualAccount.size > 0;

  if (hasActualWork) {
    try {
      await withActual(async (api) => {
        for (const t of importables) {
          const txns = pulled.get(t.plaidAccountId) ?? [];
          try {
            const result = await importBatch(api, t.mapping!.actual_account_id, txns);
            const count = result.added.length;
            totalImported += count;
            perAccountOutcomes.push({
              plaidAccountId: t.plaidAccountId,
              status: "success",
              txnsImported: count,
              reason: null,
            });
          } catch (err) {
            anyFailure = true;
            perAccountOutcomes.push({
              plaidAccountId: t.plaidAccountId,
              status: "failure",
              txnsImported: 0,
              reason: errMsg(err),
            });
          }
        }

        for (const [actualAccountId, removals] of removalsByActualAccount.entries()) {
          await processRemovals(api, runId, actualAccountId, removals, log);
        }
      });
    } catch (err) {
      anyFailure = true;
      for (const t of importables) {
        perAccountOutcomes.push({
          plaidAccountId: t.plaidAccountId,
          status: "failure",
          txnsImported: 0,
          reason: `actual_unreachable: ${errMsg(err)}`,
        });
      }
    }
  }

  for (const outcome of perAccountOutcomes) {
    syncAccountResults.record({
      syncRunId: runId,
      plaidAccountId: outcome.plaidAccountId,
      status: outcome.status,
      txnsImported: outcome.txnsImported,
      reason: outcome.reason,
    });
  }

  const status: "success" | "failure" = anyFailure ? "failure" : "success";
  syncRuns.finish({ id: runId, status, totalImported });

  return { runId, status, totalImported };
}

function collectTargets(args: RunSyncArgs): PerAccount[] {
  const allAccounts = plaidAccounts.listAll();
  const allMappings = new Map(
    accountMappings.listAll().map((m) => [m.plaid_account_id, m]),
  );
  const allItems = new Map(plaidItems.listAll().map((i) => [i.id, i]));

  const wanted =
    args.scope === "all"
      ? allAccounts
      : allAccounts.filter((a) => (args.plaidAccountIds ?? []).includes(a.plaid_account_id));

  const out: PerAccount[] = [];
  for (const acct of wanted) {
    const item = allItems.get(acct.item_id);
    if (!item) continue;
    out.push({
      plaidAccountId: acct.plaid_account_id,
      mapping: allMappings.get(acct.plaid_account_id),
      account: acct,
      item,
    });
  }
  return out;
}

function groupByItem(targets: PerAccount[]): Map<string, PerAccount[]> {
  const m = new Map<string, PerAccount[]>();
  for (const t of targets) {
    const list = m.get(t.item.id) ?? [];
    list.push(t);
    m.set(t.item.id, list);
  }
  return m;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
