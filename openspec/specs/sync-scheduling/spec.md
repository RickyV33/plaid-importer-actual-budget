# sync-scheduling Specification

## Purpose
TBD - created by archiving change sync-scheduling. Update Purpose after archive.
## Requirements
### Requirement: Schedules target a set of connections

The system SHALL store schedules in a `schedules` table owned by a user, each referencing the set of `plaid_item_ids` (connections) to sync, a cadence (interval hours), and an `enabled` flag. Connections billing in Plaid is per item, so scheduling is by connection rather than by account. The connections SHALL be owned by the schedule's owner.

#### Scenario: Creating a schedule
- **WHEN** an authenticated user creates a schedule selecting one or more of their connections and a cadence
- **THEN** a `schedules` row is persisted with `enabled=true` and a computed `next_run_at`

#### Scenario: Owner scoping
- **WHEN** a user references a connection or schedule owned by another user
- **THEN** the referenced connection is dropped (or the schedule is 404), and nothing of another user's is changed

### Requirement: Scheduled runs reuse stored mapping settings and fan out

When a schedule fires, the system SHALL expand its connections to their accounts and invoke the sync orchestrator with `triggered_by="scheduled"`, using the per-(profile, account) settings already stored in `profile_account_mappings` (including `pending_visible`). Each connection is pulled once and fans out to every profile that maps its accounts. A schedule SHALL NOT carry its own copy of those settings.

#### Scenario: Pending setting honored from the mapping
- **WHEN** a scheduled run delivers an account whose profile mapping has `pending_visible=1`
- **THEN** that profile imports pending transactions for the account, matching a manual run with the same mapping

#### Scenario: Connection fans out to all mapping profiles
- **WHEN** a scheduled connection's account is mapped in more than one profile
- **THEN** the single pull updates every profile that maps it

#### Scenario: Run recorded as scheduled
- **WHEN** a schedule fires a sync
- **THEN** the resulting `sync_runs` row has `triggered_by="scheduled"`

### Requirement: In-process scheduler fires due schedules without overlapping runs

The system SHALL run an in-process scheduler that periodically evaluates enabled schedules and triggers those whose `next_run_at` has passed, then recomputes `next_run_at` and records `last_run_at`. A schedule SHALL NOT start a run while another sync is in progress; it SHALL be retried on a subsequent tick. Schedule timers SHALL be recoverable across restarts from persisted `next_run_at`.

#### Scenario: Due schedule fires
- **WHEN** an enabled schedule's `next_run_at` is in the past and no sync is running
- **THEN** the scheduler triggers a scheduled sync, updates `last_run_at`, and computes the next `next_run_at`

#### Scenario: Skips while a sync is in progress
- **WHEN** a schedule becomes due while another sync (manual or scheduled) is running
- **THEN** the scheduler does not start an overlapping run and re-evaluates the schedule on the next tick

#### Scenario: Disabled schedule does not fire
- **WHEN** a schedule has `enabled=false`
- **THEN** the scheduler never triggers it

#### Scenario: Recovery after restart
- **WHEN** the process restarts and a schedule was due during downtime
- **THEN** the scheduler recomputes due schedules from persisted `next_run_at` and fires it shortly after boot

