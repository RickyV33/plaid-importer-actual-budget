import { schedules } from "../db/queries.js";
import type { RunLogger } from "../sync/lifecycle.js";
import { isSyncRunning, runSync } from "../sync/run.js";

let timer: NodeJS.Timeout | undefined;

export type TickLogger = Pick<RunLogger, "warn" | "info"> & {
  error?: (obj: object, msg?: string) => void;
};

const NOOP: TickLogger = { warn: () => {}, info: () => {}, error: () => {} };

/** One evaluation pass: fire any due, enabled schedules that wouldn't overlap a sync. */
export async function tick(now: number = Date.now(), log: TickLogger = NOOP): Promise<void> {
  if (isSyncRunning()) return;

  for (const s of schedules.listDue(now)) {
    if (isSyncRunning()) break;

    let accountIds: string[] = [];
    try {
      accountIds = JSON.parse(s.plaid_account_ids) as string[];
    } catch {
      accountIds = [];
    }

    try {
      await runSync({
        triggeredBy: "scheduled",
        scope: "selected",
        ownerUserId: s.owner_user_id,
        plaidAccountIds: accountIds,
        logger: log,
      });
    } catch (err) {
      log.error?.({ err, scheduleId: s.id }, "scheduled_sync_failed");
    }

    // Advance regardless of outcome so a failing schedule doesn't hammer every tick.
    schedules.markRan(s.id, now, now + s.interval_hours * 3600_000);
  }
}

/** Start the in-process scheduler. Idempotent. */
export function startScheduler(opts?: { intervalMs?: number; log?: TickLogger }): void {
  if (timer) return;
  const intervalMs = opts?.intervalMs ?? 60_000;
  const log = opts?.log ?? NOOP;
  timer = setInterval(() => {
    void tick(Date.now(), log);
  }, intervalMs);
  // Don't keep the process alive solely for the scheduler.
  timer.unref?.();
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = undefined;
  }
}
