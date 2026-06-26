## MODIFIED Requirements

### Requirement: Schedules target a set of connections

The system SHALL store schedules in a `schedules` table owned by a user, each referencing the set of `plaid_item_ids` (connections) to sync, a cadence, and an `enabled` flag. Connections billing in Plaid is per item, so scheduling is by connection rather than by account. The connections SHALL be owned by the schedule's owner.

New schedules use the structured cadence (`days_of_week`, `time_of_day`, `repeat_weeks`, `timezone`). Legacy schedules that predate this change retain a non-null `interval_hours` value and are identified as legacy by `days_of_week IS NULL`. Both row formats are valid and coexist in the table. `interval_hours` is a candidate for removal in a future migration once all legacy rows have been migrated.

#### Scenario: Creating a schedule
- **WHEN** an authenticated user creates a schedule selecting one or more of their connections and a cadence
- **THEN** a `schedules` row is persisted with `enabled=true`, `interval_hours=NULL`, the new cadence fields set, and a computed `next_run_at`

#### Scenario: Owner scoping
- **WHEN** a user references a connection or schedule owned by another user
- **THEN** the referenced connection is dropped (or the schedule is 404), and nothing of another user's is changed

### Requirement: In-process scheduler fires due schedules without overlapping runs

The system SHALL run an in-process scheduler that periodically evaluates enabled schedules and triggers those whose `next_run_at` has passed, then recomputes `next_run_at` and records `last_run_at`. A schedule SHALL NOT start a run while another sync is in progress; it SHALL be retried on a subsequent tick. Schedule timers SHALL be recoverable across restarts from persisted `next_run_at`.

After a run, `next_run_at` is advanced using the schedule's cadence type:
- **Legacy** (`interval_hours IS NOT NULL`): `next_run_at = last_run_at + interval_hours * 3600_000`
- **New format** (`days_of_week IS NOT NULL`): `next_run_at = nextOccurrence(days_of_week, time_of_day, repeat_weeks, timezone, last_run_at)`

#### Scenario: Due new-format schedule fires and advances correctly
- **WHEN** an enabled new-format schedule's `next_run_at` is in the past and no sync is running
- **THEN** the scheduler triggers a sync, updates `last_run_at`, and sets `next_run_at` to the next matching day/time occurrence

#### Scenario: Due legacy schedule fires and advances correctly
- **WHEN** an enabled legacy schedule's `next_run_at` is in the past and no sync is running
- **THEN** the scheduler triggers a sync and advances `next_run_at` by `interval_hours` hours

#### Scenario: Skips while a sync is in progress
- **WHEN** a schedule becomes due while another sync (manual or scheduled) is running
- **THEN** the scheduler does not start an overlapping run and re-evaluates the schedule on the next tick

#### Scenario: Disabled schedule does not fire
- **WHEN** a schedule has `enabled=false`
- **THEN** the scheduler never triggers it

#### Scenario: Recovery after restart
- **WHEN** the process restarts and a schedule was due during downtime
- **THEN** the scheduler recomputes due schedules from persisted `next_run_at` and fires it shortly after boot
