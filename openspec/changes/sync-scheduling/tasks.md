## 1. Schema

- [x] 1.1 Add migration `src/db/migrations/0006_schedules.sql`: create `schedules` (id, owner_user_id FK, profile_id FK, plaid_account_ids TEXT (JSON or CSV), cadence, enabled INTEGER NOT NULL DEFAULT 1, last_run_at, next_run_at, created_at, updated_at) with an index on (enabled, next_run_at).

## 2. Data access

- [x] 2.1 Add a `schedules` query module to `src/db/queries.ts` (create, update, setEnabled, delete, getById, listByOwner, listDue(now)) with a `ScheduleRow` type and owner scoping.

## 3. Scheduler runner

- [x] 3.1 Add `src/scheduler/runner.ts`: an interval tick that loads due enabled schedules, and for each (when no sync is in flight) calls `runSync({ triggeredBy: "scheduled", scope: "selected", plaidAccountIds })`, then updates `last_run_at`/`next_run_at`.
- [x] 3.2 Respect the Actual `inFlight` guard — skip and re-evaluate next tick rather than overlapping; compute `next_run_at` from cadence; recover due schedules from persisted `next_run_at` on boot.
- [x] 3.3 Start the runner from `main()` in `src/server.ts` after the server is listening; make the tick interval configurable with a sane default.

## 4. Management routes & views

- [x] 4.1 Add `src/routes/schedules.ts` (owner-scoped create/edit/enable-disable/delete) and register in `src/server.ts`.
- [x] 4.2 Add `schedules.eta` view to manage schedules per profile (select accounts from the profile's mapped accounts, set cadence, toggle enabled).

## 5. History badge

- [x] 5.1 Update `src/views/history.eta` to render a trigger badge (`manual` / `scheduled`) on each run summary row. No query change (data already present).

## 6. Tests & docs

- [x] 6.1 Tests: `listDue` selection, no-overlap-with-in-flight behavior, next_run_at recomputation, disabled schedules never fire, scheduled run records `triggered_by="scheduled"`, scheduled run honors `pending_visible` from the mapping.
- [x] 6.2 Update `README` with scheduling usage and the UTC timezone note for cadence evaluation.
