## Context

`runSync` already takes `triggeredBy: "manual" | "scheduled"` ([run.ts:30](../../../src/sync/run.ts)) and `sync_runs.triggered_by` already stores it ([0001_init.sql:42](../../../src/db/migrations/0001_init.sql)) — the original design reserved `scheduled` for exactly this. After `profiles-and-budgets`, a sync targets specific accounts and drains to the profiles connected to their items. A schedule is therefore "run a sync for this profile's accounts on a cadence." Settings like `pending_visible` already live on `profile_account_mappings`, so a schedule does not need to carry them.

## Goals / Non-Goals

**Goals:**
- Per-profile schedules selecting which Plaid accounts to sync and how often.
- Reuse the existing orchestrator and per-profile drain unchanged, just with `triggeredBy="scheduled"`.
- Visible manual-vs-scheduled distinction in history.

**Non-Goals:**
- Per-schedule setting overrides (reuse stored profile settings).
- External/distributed cron, clustering, missed-run catch-up beyond a normal next-run drain.
- Failure notifications/alerting (history already records outcomes).

## Decisions

**In-process scheduler over external cron.**
A single timer in the app process evaluates due schedules and calls `runSync`. Rationale: the app is a single long-running container with a SQLite DB and a process-global Actual singleton; an in-process runner can naturally serialize against manual syncs and avoid overlapping budget downloads. Alternative considered: system cron hitting an authenticated endpoint — rejected as more moving parts (auth for the cron caller, no shared lock with manual runs) for a single-instance deploy.

**Schedule references a profile + account list; settings come from the mapping.**
`schedules` stores `profile_id` and the set of `plaid_account_ids` to sync. At fire time the runner resolves those accounts' per-profile mappings (including `pending_visible`) — one source of truth. Alternative (schedule carries its own settings) was explicitly declined in exploration.

**Serialize with manual runs via the existing mutex.**
The Actual client's `inFlight` guard already rejects overlapping runs. The scheduler SHALL skip (and re-evaluate next tick) a schedule whose run would overlap an in-progress sync, rather than queueing unboundedly.

**Trigger badge in history.**
`history.eta` already receives `triggered_by`; render it as a badge. No schema or query change for the read side.

## Risks / Trade-offs

- **Overlapping runs / long syncs** → Scheduler checks the in-flight guard and skips rather than stacking; a schedule that can't run this tick runs on the next eligible tick.
- **Process restart loses in-memory timers** → `next_run_at` is persisted; on boot the runner recomputes due schedules from the table, so a restart doesn't drop schedules (a run that was due during downtime fires shortly after boot).
- **Clock/timezone drift in cron evaluation** → Store schedules in a single well-defined timezone (UTC) and document it; keep interval-based schedules as a simpler alternative.
- **Cost interaction with fan-out** → Each scheduled run still pulls each item at most once (PULL/journal from Change B), so scheduling does not multiply Plaid cost beyond the chosen cadence.

## Migration Plan

1. Ship `0005_schedules.sql` (additive).
2. Start the runner from `main()` after the server is listening; it reads enabled schedules and ticks on an interval.
3. No data migration; existing deployments simply gain the feature with zero schedules.
4. Rollback: previous build ignores the `schedules` table and the runner is absent; manual sync is unaffected.

## Open Questions

- Cron expression syntax vs. simple interval (every N hours). Lean: support a small fixed set of intervals first; add cron later if needed. Resolve in implementation.
