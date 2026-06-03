## Why

Syncing is manual today — a user must click "Sync" ([sync route](../../../src/routes/sync.ts), [run.ts](../../../src/sync/run.ts)). For a hosted, multi-profile setup people want budgets to stay current automatically. The data model already anticipates this: `sync_runs.triggered_by` accepts `manual` and `scheduled`, and the orchestrator takes the trigger as an argument. This change adds the scheduler and surfaces the distinction in the audit history.

## What Changes

- **New `sync-scheduling` capability.** A `schedules` table tied to a profile, holding which Plaid accounts to sync, a cron/interval expression, and an `enabled` flag. An in-process scheduler fires due schedules, invoking the existing sync orchestrator with `triggered_by="scheduled"`.
- Scheduled runs **reuse** the per-profile-account stored settings (e.g. `pending_visible` from `profile_account_mappings`); a schedule does NOT carry its own copy of those settings.
- Owner-scoped management UI/routes to create, edit, enable/disable, and delete schedules.
- Audit history visibly distinguishes scheduled runs from manual ones (the data already records `triggered_by`).

## Capabilities

### New Capabilities
- `sync-scheduling`: schedule records (profile + accounts + cron/interval + enabled), the in-process runner that triggers due syncs as `scheduled`, and owner-scoped schedule management.

### Modified Capabilities
- `sync-history`: the history view SHALL render the trigger (`manual` vs `scheduled`) for each run as a visible badge.

## Impact

- **Schema**: new migration `0006_schedules.sql` — create `schedules` (id, profile_id FK, owner_user_id FK, plaid_account_ids, cron/interval, enabled, last_run_at, next_run_at, timestamps).
- **Code**:
  - New `src/scheduler/runner.ts` — evaluates due schedules and calls `runSync({ triggeredBy: "scheduled", ... })`; started from `main()` in `src/server.ts`. Respects the Actual singleton (no overlapping runs).
  - `src/db/queries.ts` — `schedules` query module.
  - New `src/routes/schedules.ts` + `schedules.eta` view; owner-scoped.
  - `src/views/history.eta` — render a trigger badge per run.
- **Depends on**: `profiles-and-budgets` (a schedule targets a profile and drains via the per-profile path).
- **Out of scope**: distributed/external cron, per-schedule setting overrides (reuse profile settings), notifications/alerting on scheduled failures, catch-up/backfill semantics beyond a normal drain.
