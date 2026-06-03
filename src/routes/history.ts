import type { FastifyInstance } from "fastify";

import { currentUser, requireUserId } from "../auth/middleware.js";
import {
  plaidAccounts,
  syncAccountResults,
  syncOrphanDeletes,
  syncRuns,
  type SyncAccountResultRow,
  type SyncOrphanDeleteRow,
  type SyncRunRow,
} from "../db/queries.js";
import { render, renderPartial } from "../views/render.js";

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
    const userId = requireUserId(req, reply);
    if (userId === undefined) return;

    const offset = clampOffset(req.query.offset);
    const runs: SyncRunRow[] = syncRuns.listRecentByOwner(userId, PAGE_SIZE + 1, offset);
    const hasMore = runs.length > PAGE_SIZE;
    const pageRuns = hasMore ? runs.slice(0, PAGE_SIZE) : runs;

    const acctNameByPlaidId = new Map(
      plaidAccounts.listByOwner(userId).map((a) => [a.plaid_account_id, a.name]),
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

    const orphans = orphanViews(acctNameByPlaidId);

    return render(reply, "history", {
      title: "Sync history",
      authed: true,
      isAdmin: currentUser(req)?.role === "admin",
      runs: views,
      orphans,
      hasMore,
      nextOffset: offset + PAGE_SIZE,
      prevOffset: Math.max(0, offset - PAGE_SIZE),
      offset,
    });
  });

  app.post<{ Params: { id: string } }>(
    "/history/orphans/:id/ack",
    async (req, reply) => {
      const userId = requireUserId(req, reply);
      if (userId === undefined) return;

      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isFinite(id) || id < 1) {
        return reply.code(404).send({ error: "not_found" });
      }

      const acctNameByPlaidId = new Map(
        plaidAccounts.listByOwner(userId).map((a) => [a.plaid_account_id, a.name]),
      );

      // Only acknowledge orphans that belong to one of this owner's accounts.
      const orphan = syncOrphanDeletes.getById(id);
      if (!orphan || !acctNameByPlaidId.has(orphan.plaid_account_id)) {
        return reply.code(404).send({ error: "not_found" });
      }
      const changed = syncOrphanDeletes.ack(id);
      if (changed === 0) {
        return reply.code(404).send({ error: "not_found" });
      }

      const orphans = orphanViews(acctNameByPlaidId);

      const html = renderPartial("partials/orphan_banner", { orphans });
      return reply.type("text/html; charset=utf-8").send(html);
    },
  );
}

export type OrphanView = {
  id: number;
  payeeName: string | null;
  amountCents: number | null;
  date: string | null;
  errorReason: string;
  plaidAccountName: string;
};

function orphanViews(
  acctNameByPlaidId: Map<string, string>,
): OrphanView[] {
  return syncOrphanDeletes
    .listUnacknowledged()
    // Scope to the requesting owner's accounts only.
    .filter((o: SyncOrphanDeleteRow) => acctNameByPlaidId.has(o.plaid_account_id))
    .map((o: SyncOrphanDeleteRow) => ({
      id: o.id,
      payeeName: o.payee_name,
      amountCents: o.amount_cents,
      date: o.date,
      errorReason: o.error_reason,
      plaidAccountName:
        acctNameByPlaidId.get(o.plaid_account_id) ?? o.plaid_account_id,
    }));
}

function clampOffset(raw: string | undefined): number {
  if (!raw) return 0;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}
