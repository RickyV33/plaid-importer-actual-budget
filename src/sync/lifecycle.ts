import {
  syncOrphanDeletes,
  type AccountMappingRow,
} from "../db/queries.js";

export type RunLogger = {
  warn: (obj: object, msg?: string) => void;
  info: (obj: object, msg?: string) => void;
};

export type PendingRemoval = {
  plaidTransactionId: string;
  plaidAccountId: string;
  actualAccountId: string;
  plaidItemId: string;
};

export type PendingPromotion = {
  plaidPostedTransactionId: string;
  plaidPendingTransactionId: string;
  plaidAccountId: string;
  actualAccountId: string;
  plaidItemId: string;
  amount: number;
  date: string;
  importedPayee: string;
};

export type ImportedIdEntry = {
  id: string;
  payee: string | null;
  amount: number | null;
  date: string | null;
};

export type ActualReadDeleteApi = {
  getTransactions: (
    accountId: string,
    startDate: string,
    endDate: string,
  ) => Promise<ReadonlyArray<{
    id: string;
    imported_id?: string;
    payee?: string | null;
    amount?: number;
    date?: string;
  }>>;
  deleteTransaction: (id: string) => Promise<unknown>;
  updateTransaction: (id: string, fields: Record<string, unknown>) => Promise<unknown>;
};

export const LOOKUP_WINDOW_DAYS = 30;

export function shouldImportTxn(
  mapping: Pick<AccountMappingRow, "pending_visible"> | undefined,
  txn: { pending: boolean | null | undefined },
): boolean {
  if (!mapping) return false;
  if (!mapping.pending_visible && txn.pending) return false;
  return true;
}

export type DeltaTransaction = {
  account_id: string;
  transaction_id: string;
  date: string;
  amount: number;
  pending: boolean | null | undefined;
  pending_transaction_id?: string | null;
  merchant_name?: string | null;
  name?: string | null;
};

export type DeltaRemoved = {
  transaction_id?: string | null;
  account_id?: string | null;
};

export type BucketTarget = {
  mapping: Pick<AccountMappingRow, "pending_visible" | "actual_account_id"> | undefined;
};

export type BucketDeltaArgs = {
  delta: {
    added: ReadonlyArray<DeltaTransaction>;
    modified: ReadonlyArray<DeltaTransaction>;
    removed: ReadonlyArray<DeltaRemoved>;
  };
  targetByPlaidAcct: Map<string, BucketTarget>;
  plaidItemId: string;
};

export type BucketDeltaResult<T extends DeltaTransaction = DeltaTransaction> = {
  importsByPlaidAccount: Map<string, T[]>;
  promotionsByActualAccount: Map<string, PendingPromotion[]>;
  promotionPlaidTxnByPostedId: Map<string, T>;
  removalsByActualAccount: Map<string, PendingRemoval[]>;
};

export function bucketDelta<T extends DeltaTransaction, B extends BucketTarget>(args: {
  delta: { added: ReadonlyArray<T>; modified: ReadonlyArray<T>; removed: ReadonlyArray<DeltaRemoved> };
  targetByPlaidAcct: Map<string, B>;
  plaidItemId: string;
}): BucketDeltaResult<T> {
  const { delta, targetByPlaidAcct, plaidItemId } = args;

  const pendingIdsBeingPromoted = new Set<string>();
  for (const txn of delta.added) {
    if (txn.pending_transaction_id) pendingIdsBeingPromoted.add(txn.pending_transaction_id);
  }
  for (const txn of delta.modified) {
    if (txn.pending_transaction_id) pendingIdsBeingPromoted.add(txn.pending_transaction_id);
  }

  const importsByPlaidAccount = new Map<string, T[]>();
  const promotionsByActualAccount = new Map<string, PendingPromotion[]>();
  const promotionPlaidTxnByPostedId = new Map<string, T>();
  const removalsByActualAccount = new Map<string, PendingRemoval[]>();

  const collect = (txn: T) => {
    const target = targetByPlaidAcct.get(txn.account_id);
    if (!target) return;
    if (!shouldImportTxn(target.mapping, txn)) return;

    if (txn.pending_transaction_id && target.mapping) {
      const actualAccountId = target.mapping.actual_account_id;
      const promotion: PendingPromotion = {
        plaidPostedTransactionId: txn.transaction_id,
        plaidPendingTransactionId: txn.pending_transaction_id,
        plaidAccountId: txn.account_id,
        actualAccountId,
        plaidItemId,
        amount: Math.round(txn.amount * 100) * -1,
        date: txn.date,
        importedPayee: txn.merchant_name ?? txn.name ?? "Unknown",
      };
      const list = promotionsByActualAccount.get(actualAccountId) ?? [];
      list.push(promotion);
      promotionsByActualAccount.set(actualAccountId, list);
      promotionPlaidTxnByPostedId.set(promotion.plaidPostedTransactionId, txn);
      return;
    }

    const list = importsByPlaidAccount.get(txn.account_id) ?? [];
    list.push(txn);
    importsByPlaidAccount.set(txn.account_id, list);
  };

  for (const txn of delta.added) collect(txn);
  for (const txn of delta.modified) collect(txn);

  for (const removed of delta.removed) {
    const plaidAccountId = removed.account_id;
    if (!plaidAccountId) continue;
    if (!removed.transaction_id) continue;
    if (pendingIdsBeingPromoted.has(removed.transaction_id)) continue;
    const target = targetByPlaidAcct.get(plaidAccountId);
    if (!target?.mapping) continue;
    const actualAccountId = target.mapping.actual_account_id;
    const list = removalsByActualAccount.get(actualAccountId) ?? [];
    list.push({
      plaidTransactionId: removed.transaction_id,
      plaidAccountId,
      actualAccountId,
      plaidItemId,
    });
    removalsByActualAccount.set(actualAccountId, list);
  }

  return {
    importsByPlaidAccount,
    promotionsByActualAccount,
    promotionPlaidTxnByPostedId,
    removalsByActualAccount,
  };
}

export function buildImportedIdMapFromTxns(
  txns: ReadonlyArray<{
    id: string;
    imported_id?: string;
    payee?: string | null;
    amount?: number;
    date?: string;
  }>,
): Map<string, ImportedIdEntry> {
  const out = new Map<string, ImportedIdEntry>();
  for (const t of txns) {
    if (!t.imported_id) continue;
    out.set(t.imported_id, {
      id: t.id,
      payee: t.payee ?? null,
      amount: typeof t.amount === "number" ? t.amount : null,
      date: t.date ?? null,
    });
  }
  return out;
}

export async function buildImportedIdMap(
  api: ActualReadDeleteApi,
  actualAccountId: string,
  today: Date = new Date(),
): Promise<Map<string, ImportedIdEntry>> {
  const start = isoDateOffsetDays(today, -LOOKUP_WINDOW_DAYS);
  const end = isoDateOffsetDays(today, LOOKUP_WINDOW_DAYS);
  const txns = await api.getTransactions(actualAccountId, start, end);
  return buildImportedIdMapFromTxns(txns);
}

export async function processRemovals(
  api: ActualReadDeleteApi,
  runId: number,
  actualAccountId: string,
  removals: PendingRemoval[],
  importedIdMap: Map<string, ImportedIdEntry>,
  log: RunLogger,
): Promise<void> {
  for (const r of removals) {
    const match = importedIdMap.get(r.plaidTransactionId);
    if (!match) {
      log.warn(
        {
          plaidTxnId: r.plaidTransactionId,
          plaidAccountId: r.plaidAccountId,
          plaidItemId: r.plaidItemId,
        },
        "remove: no matching Actual txn",
      );
      continue;
    }

    try {
      // `deleteTransaction` cascades for split parents per Actual's reconcile logic;
      // if a future Actual version changes that, the throw lands in this catch and
      // becomes a regular orphan row.
      await api.deleteTransaction(match.id);
    } catch (err) {
      syncOrphanDeletes.insert({
        syncRunId: runId,
        plaidAccountId: r.plaidAccountId,
        plaidTransactionId: r.plaidTransactionId,
        payeeName: match.payee,
        amountCents: match.amount,
        date: match.date,
        errorReason: `delete_failed: ${errMsg(err)}`,
      });
    }
  }
}

export type PromotionOutcomes = {
  updated: PendingPromotion[];
  fellThrough: PendingPromotion[];
};

export async function processPromotions(
  api: ActualReadDeleteApi,
  _runId: number,
  actualAccountId: string,
  promotions: PendingPromotion[],
  importedIdMap: Map<string, ImportedIdEntry>,
  log: RunLogger,
): Promise<PromotionOutcomes> {
  const updated: PendingPromotion[] = [];
  const fellThrough: PendingPromotion[] = [];

  for (const p of promotions) {
    const match = importedIdMap.get(p.plaidPendingTransactionId);
    if (!match) {
      log.info(
        {
          actualAccountId,
          plaidAccountId: p.plaidAccountId,
          plaidPendingId: p.plaidPendingTransactionId,
          plaidPostedId: p.plaidPostedTransactionId,
          outcome: "fell_through",
        },
        "promote: pending row not in Actual; will insert posted txn instead",
      );
      fellThrough.push(p);
      continue;
    }

    try {
      // Per design.md: payee/payee_name are intentionally omitted. payee_name is
      // rejected by the underlying schema (it's import-only), and skipping payee
      // preserves any rename the user applied to the pending row.
      //
      // updateTransaction in @actual-app/api is fire-and-forget: the await
      // resolves immediately with undefined, writes flush via withActual's
      // terminal actual.sync(). Errors from the batch update surface as
      // unhandled rejections, not via this catch — the catch only fires for
      // synchronous validation errors (e.g., unknown field).
      await api.updateTransaction(match.id, {
        imported_id: p.plaidPostedTransactionId,
        amount: p.amount,
        cleared: true,
        date: p.date,
        imported_payee: p.importedPayee,
      });
      log.info(
        {
          actualAccountId,
          plaidAccountId: p.plaidAccountId,
          plaidPendingId: p.plaidPendingTransactionId,
          plaidPostedId: p.plaidPostedTransactionId,
          actualTxnId: match.id,
          outcome: "updated",
        },
        "promote: updated existing Actual row in place",
      );
      updated.push(p);
    } catch (err) {
      log.warn(
        {
          actualAccountId,
          plaidAccountId: p.plaidAccountId,
          plaidPendingId: p.plaidPendingTransactionId,
          plaidPostedId: p.plaidPostedTransactionId,
          actualTxnId: match.id,
          outcome: "update_failed",
          error: errMsg(err),
        },
        "promote: updateTransaction threw; falling through to insert",
      );
      fellThrough.push(p);
    }
  }

  return { updated, fellThrough };
}

function isoDateOffsetDays(from: Date, offsetDays: number): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
