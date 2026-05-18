import {
  syncOrphanDeletes,
  type AccountMappingRow,
} from "../db/queries.js";

export type RunLogger = {
  warn: (obj: object, msg?: string) => void;
};

export type PendingRemoval = {
  plaidTransactionId: string;
  plaidAccountId: string;
  actualAccountId: string;
  plaidItemId: string;
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
  log: RunLogger,
): Promise<void> {
  let map: Map<string, ImportedIdEntry>;
  try {
    map = await buildImportedIdMap(api, actualAccountId);
  } catch (err) {
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
    return;
  }

  for (const r of removals) {
    const match = map.get(r.plaidTransactionId);
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

function isoDateOffsetDays(from: Date, offsetDays: number): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
