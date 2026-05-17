## ADDED Requirements

### Requirement: Every sync run is recorded with its trigger and scope

The system SHALL persist exactly one `sync_runs` row per sync invocation with these fields: `id`, `started_at`, `finished_at` (nullable while running), `status` (`running` / `success` / `failure`), `triggered_by` (`manual` in v1, `scheduled` reserved), and `scope` (`all` / `selected`).

#### Scenario: Manual sync run is recorded
- **WHEN** the user triggers a sync run
- **THEN** a row is inserted with `triggered_by=manual` and `started_at`=now, and is updated to terminal status when the run finishes

### Requirement: Per-account results are recorded

The system SHALL persist one `sync_account_results` row per (sync run, Plaid account) targeted by that run with these fields: `sync_run_id`, `plaid_account_id`, `status` (`success` / `failure` / `skipped`), `txns_imported` (integer, 0 when not applicable), `reason` (free-form short string, nullable on success).

#### Scenario: Mixed-outcome run
- **WHEN** a sync run targets three accounts, two succeed and one is unmapped
- **THEN** three `sync_account_results` rows are recorded: two with status=`success` and a non-null `txns_imported`, one with status=`skipped` and reason=`unmapped`

### Requirement: History view shows recent runs

The system SHALL provide an authenticated `GET /history` route that renders a page listing the most recent sync runs in reverse chronological order, showing for each run: timestamp, trigger, scope, overall status, total transactions imported, and a drill-down to per-account results.

#### Scenario: Browsing history
- **WHEN** an authenticated user visits `/history`
- **THEN** the page lists the most recent sync runs (paginated if necessary), each with a summary row and an expandable per-account detail

#### Scenario: Drill-down to a single run
- **WHEN** an authenticated user expands or navigates to a specific run
- **THEN** the page shows every `sync_account_results` row for that run with the Plaid account name, status, transactions imported, and reason (if any)

### Requirement: History is queryable for future automation

The system SHALL store sync runs in a manner that supports adding a scheduled trigger without schema changes. Specifically, `sync_runs.triggered_by` accepts at least the values `manual` and `scheduled`, and the orchestrator function that performs a sync run accepts the trigger as an argument.

#### Scenario: Future scheduled-sync addition
- **WHEN** a future change adds scheduled syncing
- **THEN** the scheduled job invokes the same orchestrator with `triggered_by=scheduled`, no schema migration is required, and the history view distinguishes scheduled runs from manual ones
