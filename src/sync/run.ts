import type { Transaction } from "plaid";

import { withActual } from "../actual/client.js";
import { importBatch } from "../actual/import.js";
import { decrypt } from "../crypto/tokens.js";
import {
  accountMappings,
  plaidAccounts,
  plaidItems,
  syncAccountResults,
  syncOrphanDeletes,
  syncRuns,
  type AccountMappingRow,
  type PlaidAccountRow,
  type PlaidItemRow,
} from "../db/queries.js";
import { classifyPlaidError, syncItem } from "../plaid/sync.js";
import {
  bucketDelta,
  buildImportedIdMap,
  processPromotions,
  processRemovals,
  type ImportedIdEntry,
  type PendingPromotion,
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

const NOOP_LOGGER: RunLogger = { warn: () => {}, info: () => {} };

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
  const promotionsByActualAccount = new Map<string, PendingPromotion[]>();
  const promotionPlaidTxnByPostedId = new Map<string, Transaction>();
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

      const buckets = bucketDelta({
        delta,
        targetByPlaidAcct,
        plaidItemId: itemId,
      });

      for (const [plaidAcctId, txns] of buckets.importsByPlaidAccount.entries()) {
        const list = pulled.get(plaidAcctId) ?? [];
        list.push(...txns);
        pulled.set(plaidAcctId, list);
      }
      for (const [actualAcctId, promos] of buckets.promotionsByActualAccount.entries()) {
        const list = promotionsByActualAccount.get(actualAcctId) ?? [];
        list.push(...promos);
        promotionsByActualAccount.set(actualAcctId, list);
      }
      for (const [postedId, plaidTxn] of buckets.promotionPlaidTxnByPostedId.entries()) {
        promotionPlaidTxnByPostedId.set(postedId, plaidTxn);
      }
      for (const [actualAcctId, removals] of buckets.removalsByActualAccount.entries()) {
        const list = removalsByActualAccount.get(actualAcctId) ?? [];
        list.push(...removals);
        removalsByActualAccount.set(actualAcctId, list);
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
    importables.length > 0 ||
    removalsByActualAccount.size > 0 ||
    promotionsByActualAccount.size > 0;

  if (hasActualWork) {
    try {
      await withActual(async (api) => {
        // Build an imported_id lookup map once per Actual account that needs one.
        const accountIdsNeedingMap = new Set<string>([
          ...promotionsByActualAccount.keys(),
          ...removalsByActualAccount.keys(),
        ]);
        const mapsByActualAccount = new Map<string, Map<string, ImportedIdEntry>>();
        for (const acctId of accountIdsNeedingMap) {
          try {
            mapsByActualAccount.set(acctId, await buildImportedIdMap(api, acctId));
          } catch (err) {
            // Lookup failed for this account. For removals, record one orphan
            // per removal with lookup_failed reason (preserves the existing
            // behavior). For promotions, the empty map below causes them all
            // to fall through to the import path — graceful degradation.
            const removals = removalsByActualAccount.get(acctId) ?? [];
            for (const r of removals) {
              syncOrphanDeletes.insert({
                syncRunId: runId,
                plaidAccountId: r.plaidAccountId,
                plaidTransactionId: r.plaidTransactionId,
                payeeName: null,
                amountCents: null,
                date: null,
                errorReason: `lookup_failed: ${errMsg(err)}`,
              });
            }
            removalsByActualAccount.delete(acctId);
            mapsByActualAccount.set(acctId, new Map());
          }
        }

        // Process promotions before imports so fell-through promotions can be
        // re-routed into the imports batch as fresh inserts.
        const promotionSuccessByPlaidAccount = new Map<string, number>();
        for (const [acctId, promotions] of promotionsByActualAccount.entries()) {
          const map = mapsByActualAccount.get(acctId) ?? new Map();
          const { updated, fellThrough } = await processPromotions(
            api,
            runId,
            acctId,
            promotions,
            map,
            log,
          );
          for (const u of updated) {
            promotionSuccessByPlaidAccount.set(
              u.plaidAccountId,
              (promotionSuccessByPlaidAccount.get(u.plaidAccountId) ?? 0) + 1,
            );
          }
          for (const fp of fellThrough) {
            const plaidTxn = promotionPlaidTxnByPostedId.get(fp.plaidPostedTransactionId);
            if (!plaidTxn) continue;
            const list = pulled.get(fp.plaidAccountId) ?? [];
            list.push(plaidTxn);
            pulled.set(fp.plaidAccountId, list);
          }
        }

        // Imports (now includes any fell-through promotions).
        for (const t of importables) {
          const txns = pulled.get(t.plaidAccountId) ?? [];
          const promotionCount = promotionSuccessByPlaidAccount.get(t.plaidAccountId) ?? 0;
          try {
            const result = await importBatch(api, t.mapping!.actual_account_id, txns);
            const count = result.added.length + promotionCount;
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
          const map = mapsByActualAccount.get(actualAccountId) ?? new Map();
          await processRemovals(api, runId, actualAccountId, removals, map, log);
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
