// The History page: a page of runs plus summaries that don't depend on paging.

import {
  plaidAccounts,
  syncAccountResults,
  syncOrphanDeletes,
  syncRuns,
  type SyncAccountResultRow,
} from "../db/queries.js";
import { dailySeries, type DayPoint } from "../insights/imports.js";
import { outcomeSummary, type OutcomeSummary } from "../insights/runs.js";
import { DAY_MS } from "./shared.js";

export const PAGE_SIZE = 25;

export type HistoryRunView = {
  id: number;
  startedAt: number;
  finishedAt: number | null;
  status: string;
  triggeredBy: string;
  scope: string;
  totalImported: number;
  results: Array<SyncAccountResultRow & { accountName: string | null }>;
};

export type OrphanView = {
  id: number;
  payeeName: string | null;
  amountCents: number | null;
  date: string | null;
  errorReason: string;
  plaidAccountName: string;
};

export type HistoryView = {
  runs: HistoryRunView[];
  orphans: OrphanView[];
  hasMore: boolean;
  offset: number;
  nextOffset: number;
  prevOffset: number;
  summary: OutcomeSummary;
  daily: DayPoint[];
};

export function historyFor(userId: number, offset: number, now: number, tz: string): HistoryView {
  const runs = syncRuns.listRecentByOwner(userId, PAGE_SIZE + 1, offset);
  const hasMore = runs.length > PAGE_SIZE;
  const names = accountNames(userId);
  const recent = syncRuns.listSinceByOwner(userId, now - 90 * DAY_MS);

  return {
    runs: (hasMore ? runs.slice(0, PAGE_SIZE) : runs).map((run) => ({
      id: run.id,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      status: run.status,
      triggeredBy: run.triggered_by,
      scope: run.scope,
      totalImported: run.total_imported,
      results: syncAccountResults.listForRun(run.id).map((r) => ({ ...r, accountName: names.get(r.plaid_account_id) ?? null })),
    })),
    orphans: orphansFor(userId),
    hasMore,
    offset,
    nextOffset: offset + PAGE_SIZE,
    prevOffset: Math.max(0, offset - PAGE_SIZE),
    summary: outcomeSummary(recent.filter((r) => r.started_at >= now - 30 * DAY_MS)),
    daily: dailySeries(recent, 90, now, tz),
  };
}

function accountNames(userId: number): Map<string, string> {
  return new Map(plaidAccounts.listByOwner(userId).map((a) => [a.plaid_account_id, a.name]));
}

/** Unacknowledged orphan deletes on the user's own accounts. */
export function orphansFor(userId: number): OrphanView[] {
  const names = accountNames(userId);
  return syncOrphanDeletes
    .listUnacknowledged()
    .filter((o) => names.has(o.plaid_account_id))
    .map((o) => ({
      id: o.id,
      payeeName: o.payee_name,
      amountCents: o.amount_cents,
      date: o.date,
      errorReason: o.error_reason,
      plaidAccountName: names.get(o.plaid_account_id) ?? o.plaid_account_id,
    }));
}

/** Acknowledges an orphan on one of the user's accounts; false when there's none to acknowledge. */
export function acknowledgeOrphan(userId: number, id: number): boolean {
  const orphan = syncOrphanDeletes.getById(id);
  if (!orphan || !accountNames(userId).has(orphan.plaid_account_id)) return false;
  return syncOrphanDeletes.ack(id) > 0;
}

export function clampOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
