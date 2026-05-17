import type { FastifyInstance } from "fastify";

import {
  plaidAccounts,
  syncAccountResults,
  syncRuns,
  type SyncAccountResultRow,
  type SyncRunRow,
} from "../db/queries.js";
import { render } from "../views/render.js";

const PAGE_SIZE = 25;

export type HistoryRunView = {
  id: number;
  startedAt: number;
  finishedAt: number | null;
  status: string;
  triggeredBy: string;
  scope: string;
  totalImported: number;
  results: Array<
    SyncAccountResultRow & { accountName: string | null }
  >;
};

export function registerHistoryRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: { offset?: string } }>("/history", async (req, reply) => {
    const offset = clampOffset(req.query.offset);
    const runs: SyncRunRow[] = syncRuns.listRecent(PAGE_SIZE + 1, offset);
    const hasMore = runs.length > PAGE_SIZE;
    const pageRuns = hasMore ? runs.slice(0, PAGE_SIZE) : runs;

    const acctNameByPlaidId = new Map(
      plaidAccounts.listAll().map((a) => [a.plaid_account_id, a.name]),
    );

    const views: HistoryRunView[] = pageRuns.map((run) => ({
      id: run.id,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
      status: run.status,
      triggeredBy: run.triggered_by,
      scope: run.scope,
      totalImported: run.total_imported,
      results: syncAccountResults.listForRun(run.id).map((r) => ({
        ...r,
        accountName: acctNameByPlaidId.get(r.plaid_account_id) ?? null,
      })),
    }));

    return render(reply, "history", {
      title: "Sync history",
      authed: true,
      runs: views,
      hasMore,
      nextOffset: offset + PAGE_SIZE,
      prevOffset: Math.max(0, offset - PAGE_SIZE),
      offset,
    });
  });
}

function clampOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}
