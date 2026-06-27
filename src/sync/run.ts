import type { Transaction } from "plaid";

import { connectionForProfile, withActual } from "../actual/client.js";
import { importBatch } from "../actual/import.js";
import { decrypt, encrypt } from "../crypto/tokens.js";
import {
  plaidAccounts,
  plaidItems,
  plaidTxnEvents,
  profileAccountMappings,
  profileItemDelivery,
  profiles,
  syncAccountResults,
  syncOrphanDeletes,
  syncRuns,
  type PlaidItemRow,
  type ProfileRow,
} from "../db/queries.js";
import { classifyPlaidError, syncItem, type ItemDelta } from "../plaid/sync.js";
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
  ownerUserId: number;
  plaidAccountIds?: string[];
  logger?: RunLogger;
};

export type RunSyncResult = {
  runId: number;
  status: "success" | "failure";
  totalImported: number;
};

const NOOP_LOGGER: RunLogger = { warn: () => {}, info: () => {} };

/**
 * Which pulled connections still need a 0-import marker result row so the rate
 * limiter counts the pull: every targeted connection that was pulled
 * successfully (not in `erroredItemIds`) but produced no `sync_account_results`
 * row this run (not in `itemsWithResults`).
 */
export function pulledItemsNeedingMarker(
  targetItemIds: Iterable<string>,
  erroredItemIds: Set<string>,
  itemsWithResults: Set<string>,
): string[] {
  const out: string[] = [];
  for (const itemId of targetItemIds) {
    if (erroredItemIds.has(itemId)) continue;
    if (itemsWithResults.has(itemId)) continue;
    out.push(itemId);
  }
  return out;
}

// Run-level lock so a scheduled run won't overlap a manual one (and vice versa).
let running = false;
export function isSyncRunning(): boolean {
  return running;
}

export async function runSync(args: RunSyncArgs): Promise<RunSyncResult> {
  if (running) {
    throw new Error("sync_already_running");
  }
  running = true;
  try {
    return await runSyncInner(args);
  } finally {
    running = false;
  }
}

async function runSyncInner(args: RunSyncArgs): Promise<RunSyncResult> {
  const log = args.logger ?? NOOP_LOGGER;
  const runId = syncRuns.start({
    triggeredBy: args.triggeredBy,
    scope: args.scope,
    ownerUserId: args.ownerUserId,
  });

  // ---- Resolve owned target accounts and their items ----
  const ownedAccounts = plaidAccounts.listByOwner(args.ownerUserId);
  const requested = new Set(args.plaidAccountIds ?? []);
  const targetAccountIds = new Set(
    (args.scope === "all"
      ? ownedAccounts
      : ownedAccounts.filter((a) => requested.has(a.plaid_account_id))
    ).map((a) => a.plaid_account_id),
  );

  if (targetAccountIds.size === 0) {
    syncRuns.finish({ id: runId, status: "success", totalImported: 0 });
    return { runId, status: "success", totalImported: 0 };
  }

  const accountById = new Map(ownedAccounts.map((a) => [a.plaid_account_id, a]));
  const itemsById = new Map(plaidItems.listByOwner(args.ownerUserId).map((i) => [i.id, i]));
  const targetItemIds = new Set<string>();
  for (const id of targetAccountIds) {
    const acct = accountById.get(id);
    if (acct && itemsById.has(acct.item_id)) targetItemIds.add(acct.item_id);
  }

  // ---- PULL phase: one Plaid pull per item → journal + cursor (atomic) ----
  const itemErrors = new Map<string, string>();
  for (const itemId of targetItemIds) {
    const item = itemsById.get(itemId);
    if (!item) continue;
    try {
      const accessToken = decrypt(item.access_token_enc);
      const delta = await syncItem({ accessToken, cursor: item.cursor });
      plaidTxnEvents.appendDeltaAndAdvanceCursor({
        itemId,
        events: buildJournalEvents(delta),
        nextCursor: delta.nextCursor,
      });
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

  // ---- DRAIN phase: each owned profile connected to a pulled item ----
  let anyFailure = false;
  let totalImported = 0;

  const profilesById = new Map<number, ProfileRow>();
  for (const itemId of targetItemIds) {
    if (itemErrors.has(itemId)) continue;
    for (const p of profiles.listConnectedToItem(itemId)) {
      if (p.owner_user_id === args.ownerUserId) profilesById.set(p.id, p);
    }
  }

  for (const profile of profilesById.values()) {
    const res = await drainProfile({
      profile,
      targetItemIds,
      targetAccountIds,
      itemErrors,
      runId,
      log,
    });
    totalImported += res.imported;
    if (res.anyFailure) anyFailure = true;
  }

  // Record failures for accounts whose item could not be pulled (relink prompt).
  for (const [itemId, code] of itemErrors) {
    for (const acct of ownedAccounts) {
      if (acct.item_id === itemId && targetAccountIds.has(acct.plaid_account_id)) {
        syncAccountResults.record({
          syncRunId: runId,
          plaidAccountId: acct.plaid_account_id,
          status: "failure",
          txnsImported: 0,
          reason: code,
          profileId: null,
        });
        anyFailure = true;
      }
    }
  }

  // ---- Count every pull: a successful Plaid pull is the billable event, but
  // drain only records results when a profile delivers transactions. Ensure each
  // pulled connection has at least one result row so the rate limiter (which
  // counts runs via sync_account_results) counts no-op and unmapped pulls too.
  const itemsWithResults = new Set(
    syncAccountResults.importedByItemForRun(runId).map((r) => r.item_id),
  );
  const erroredItemIds = new Set(itemErrors.keys());
  for (const itemId of pulledItemsNeedingMarker(targetItemIds, erroredItemIds, itemsWithResults)) {
    const rep = ownedAccounts.find(
      (a) => a.item_id === itemId && targetAccountIds.has(a.plaid_account_id),
    );
    if (rep) {
      syncAccountResults.record({
        syncRunId: runId,
        plaidAccountId: rep.plaid_account_id,
        status: "success",
        txnsImported: 0,
        reason: "pulled",
        profileId: null,
      });
    }
  }

  // ---- Prune journal: drop events delivered to all connected profiles ----
  for (const itemId of targetItemIds) {
    if (itemErrors.has(itemId)) continue;
    const minDelivered = profileItemDelivery.minDeliveredForItem(itemId);
    if (minDelivered === null) {
      // No connected profiles consume this item — events are unneeded.
      plaidTxnEvents.pruneForItem(itemId, plaidTxnEvents.maxEventIdForItem(itemId));
    } else if (minDelivered > 0) {
      plaidTxnEvents.pruneForItem(itemId, minDelivered);
    }
  }

  const status: "success" | "failure" = anyFailure ? "failure" : "success";
  syncRuns.finish({ id: runId, status, totalImported });
  return { runId, status, totalImported };
}

type DrainArgs = {
  profile: ProfileRow;
  targetItemIds: Set<string>;
  targetAccountIds: Set<string>;
  itemErrors: Map<string, string>;
  runId: number;
  log: RunLogger;
};

type ItemPlan = {
  itemId: string;
  maxEventId: number;
  accountIds: Set<string>;
  delta: { added: Transaction[]; modified: Transaction[]; removed: Array<{ transaction_id: string; account_id: string }> };
  targetByPlaidAcct: Map<string, { mapping: { pending_visible: number; actual_account_id: string } }>;
};

async function drainProfile(args: DrainArgs): Promise<{ imported: number; anyFailure: boolean }> {
  const { profile, targetItemIds, targetAccountIds, itemErrors, runId, log } = args;

  // Build this profile's per-item journal slices.
  const plans: ItemPlan[] = [];
  for (const itemId of targetItemIds) {
    if (itemErrors.has(itemId)) continue;
    const mappings = profileAccountMappings
      .listForProfileAndItem(profile.id, itemId)
      .filter((m) => targetAccountIds.has(m.plaid_account_id));
    if (mappings.length === 0) continue;

    const watermark = profileItemDelivery.getWatermark(profile.id, itemId);
    const events = plaidTxnEvents.listForItemSince(itemId, watermark);
    if (events.length === 0) continue;

    const acctSet = new Set(mappings.map((m) => m.plaid_account_id));
    const added: Transaction[] = [];
    const modified: Transaction[] = [];
    const removed: Array<{ transaction_id: string; account_id: string }> = [];
    for (const ev of events) {
      if (!acctSet.has(ev.plaid_account_id)) continue;
      if (ev.event_type === "removed") {
        removed.push({ transaction_id: ev.plaid_txn_id, account_id: ev.plaid_account_id });
      } else if (ev.payload_enc) {
        const txn = JSON.parse(decrypt(ev.payload_enc)) as Transaction;
        if (ev.event_type === "added") added.push(txn);
        else modified.push(txn);
      }
    }

    plans.push({
      itemId,
      maxEventId: events[events.length - 1]!.id,
      accountIds: acctSet,
      delta: { added, modified, removed },
      targetByPlaidAcct: new Map(
        mappings.map((m) => [
          m.plaid_account_id,
          { mapping: { pending_visible: m.pending_visible, actual_account_id: m.actual_account_id } },
        ]),
      ),
    });
  }

  if (plans.length === 0) return { imported: 0, anyFailure: false };

  // Bucket each item's delta and aggregate for this profile's single budget session.
  const pulled = new Map<string, Transaction[]>();
  const promotionsByActualAccount = new Map<string, PendingPromotion[]>();
  const promotionPlaidTxnByPostedId = new Map<string, Transaction>();
  const removalsByActualAccount = new Map<string, PendingRemoval[]>();
  const plaidAccountToItem = new Map<string, string>();

  for (const plan of plans) {
    for (const acctId of plan.accountIds) plaidAccountToItem.set(acctId, plan.itemId);
    const buckets = bucketDelta<Transaction, { mapping: { pending_visible: number; actual_account_id: string } }>({
      delta: plan.delta,
      targetByPlaidAcct: plan.targetByPlaidAcct,
      plaidItemId: plan.itemId,
    });
    for (const [k, v] of buckets.importsByPlaidAccount) {
      pulled.set(k, [...(pulled.get(k) ?? []), ...v]);
    }
    for (const [k, v] of buckets.promotionsByActualAccount) {
      promotionsByActualAccount.set(k, [...(promotionsByActualAccount.get(k) ?? []), ...v]);
    }
    for (const [k, v] of buckets.promotionPlaidTxnByPostedId) promotionPlaidTxnByPostedId.set(k, v);
    for (const [k, v] of buckets.removalsByActualAccount) {
      removalsByActualAccount.set(k, [...(removalsByActualAccount.get(k) ?? []), ...v]);
    }
  }

  // Per-account outcome and per-item failure tracking.
  const outcomeByAccount = new Map<string, { status: "success" | "failure"; imported: number; reason: string | null }>();
  const itemFailed = new Set<string>();
  const markFail = (plaidAccountId: string, reason: string) => {
    outcomeByAccount.set(plaidAccountId, { status: "failure", imported: 0, reason });
    const itemId = plaidAccountToItem.get(plaidAccountId);
    if (itemId) itemFailed.add(itemId);
  };

  let imported = 0;
  try {
    await withActual(connectionForProfile(profile), async (api) => {
      const accountIdsNeedingMap = new Set<string>([
        ...promotionsByActualAccount.keys(),
        ...removalsByActualAccount.keys(),
      ]);
      const mapsByActualAccount = new Map<string, Map<string, ImportedIdEntry>>();
      for (const acctId of accountIdsNeedingMap) {
        try {
          mapsByActualAccount.set(acctId, await buildImportedIdMap(api, acctId));
        } catch (err) {
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

      const promotionSuccessByPlaidAccount = new Map<string, number>();
      for (const [acctId, promotions] of promotionsByActualAccount) {
        const map = mapsByActualAccount.get(acctId) ?? new Map();
        const { updated, fellThrough } = await processPromotions(api, runId, acctId, promotions, map, log);
        for (const u of updated) {
          promotionSuccessByPlaidAccount.set(
            u.plaidAccountId,
            (promotionSuccessByPlaidAccount.get(u.plaidAccountId) ?? 0) + 1,
          );
        }
        for (const fp of fellThrough) {
          const plaidTxn = promotionPlaidTxnByPostedId.get(fp.plaidPostedTransactionId);
          if (!plaidTxn) continue;
          pulled.set(fp.plaidAccountId, [...(pulled.get(fp.plaidAccountId) ?? []), plaidTxn]);
        }
      }

      // Imports per mapped account in this profile.
      for (const plan of plans) {
        for (const [plaidAccountId, t] of plan.targetByPlaidAcct) {
          const txns = pulled.get(plaidAccountId) ?? [];
          const promo = promotionSuccessByPlaidAccount.get(plaidAccountId) ?? 0;
          try {
            const result = await importBatch(api, t.mapping.actual_account_id, txns);
            const count = result.added.length + promo;
            imported += count;
            const prev = outcomeByAccount.get(plaidAccountId);
            outcomeByAccount.set(plaidAccountId, {
              status: prev?.status === "failure" ? "failure" : "success",
              imported: (prev?.imported ?? 0) + count,
              reason: prev?.reason ?? null,
            });
          } catch (err) {
            markFail(plaidAccountId, errMsg(err));
          }
        }
      }

      for (const [actualAccountId, removals] of removalsByActualAccount) {
        const map = mapsByActualAccount.get(actualAccountId) ?? new Map();
        await processRemovals(api, runId, actualAccountId, removals, map, log);
      }
    });
  } catch (err) {
    // Budget unreachable / init or download failed — fail the whole profile,
    // advance no watermarks so it retries from the journal next run.
    for (const plan of plans) {
      for (const plaidAccountId of plan.accountIds) {
        markFail(plaidAccountId, `actual_unreachable: ${errMsg(err)}`);
      }
    }
  }

  // Record per (profile, account) results.
  let anyFailure = false;
  for (const plan of plans) {
    for (const plaidAccountId of plan.accountIds) {
      const o = outcomeByAccount.get(plaidAccountId) ?? { status: "success" as const, imported: 0, reason: null };
      if (o.status === "failure") anyFailure = true;
      syncAccountResults.record({
        syncRunId: runId,
        plaidAccountId,
        status: o.status,
        txnsImported: o.imported,
        reason: o.reason,
        profileId: profile.id,
      });
    }
  }

  // Advance watermark only for items that fully succeeded for this profile.
  for (const plan of plans) {
    if (!itemFailed.has(plan.itemId)) {
      profileItemDelivery.setWatermark(profile.id, plan.itemId, plan.maxEventId);
    }
  }

  return { imported, anyFailure };
}

function buildJournalEvents(delta: ItemDelta): Array<{
  plaidAccountId: string;
  eventType: "added" | "modified" | "removed";
  plaidTxnId: string;
  payloadEnc: string | null;
}> {
  const events: Array<{
    plaidAccountId: string;
    eventType: "added" | "modified" | "removed";
    plaidTxnId: string;
    payloadEnc: string | null;
  }> = [];
  for (const t of delta.added) {
    events.push({ plaidAccountId: t.account_id, eventType: "added", plaidTxnId: t.transaction_id, payloadEnc: encrypt(JSON.stringify(t)) });
  }
  for (const t of delta.modified) {
    events.push({ plaidAccountId: t.account_id, eventType: "modified", plaidTxnId: t.transaction_id, payloadEnc: encrypt(JSON.stringify(t)) });
  }
  for (const r of delta.removed) {
    events.push({ plaidAccountId: r.account_id ?? "", eventType: "removed", plaidTxnId: r.transaction_id ?? "", payloadEnc: null });
  }
  return events;
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
