# sync-history Specification

## Purpose
TBD - created by archiving change init-plaid-importer. Update Purpose after archive.
## Requirements
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

The system SHALL provide an authenticated `GET /history` route that renders a page listing the most recent sync runs in reverse chronological order, showing for each run: timestamp, **trigger rendered as a visible badge distinguishing `manual` from `scheduled`**, scope, overall status, total transactions imported, and a drill-down to per-account results.

#### Scenario: Browsing history
- **WHEN** an authenticated user visits `/history`
- **THEN** the page lists the most recent sync runs (paginated if necessary), each with a summary row and an expandable per-account detail

#### Scenario: Scheduled vs manual is visible
- **WHEN** the history list contains both manual and scheduled runs
- **THEN** each run shows a badge indicating whether it was `manual` or `scheduled`

#### Scenario: Drill-down to a single run
- **WHEN** an authenticated user expands or navigates to a specific run
- **THEN** the page shows every `sync_account_results` row for that run with the Plaid account name, status, transactions imported, and reason (if any)

### Requirement: History is queryable for future automation

The system SHALL store sync runs in a manner that supports adding a scheduled trigger without schema changes. Specifically, `sync_runs.triggered_by` accepts at least the values `manual` and `scheduled`, and the orchestrator function that performs a sync run accepts the trigger as an argument.

#### Scenario: Future scheduled-sync addition
- **WHEN** a future change adds scheduled syncing
- **THEN** the scheduled job invokes the same orchestrator with `triggered_by=scheduled`, no schema migration is required, and the history view distinguishes scheduled runs from manual ones

### Requirement: Orphan-delete events are persisted across sync runs

The system SHALL persist one `sync_orphan_deletes` row per failed `deleteTransaction` call against Actual during a sync run, with these fields: `id`, `sync_run_id`, `plaid_account_id`, `plaid_transaction_id`, `payee_name`, `amount_cents`, `date`, `error_reason`, `created_at`, `acknowledged_at` (nullable). The row SHALL remain present and unacknowledged across subsequent sync runs until the user acknowledges it.

#### Scenario: Failed delete during sync
- **WHEN** a sync run resolves a removed Plaid transaction to an Actual id and `deleteTransaction` throws
- **THEN** a `sync_orphan_deletes` row is inserted with `acknowledged_at` NULL and the Plaid txn metadata captured

#### Scenario: Successful subsequent sync does not clear unacknowledged orphans
- **WHEN** a later sync run completes without errors for the same account
- **THEN** any previously-recorded unacknowledged `sync_orphan_deletes` rows remain present and unacknowledged

### Requirement: History page surfaces unacknowledged orphans

The system SHALL render a yellow banner on `GET /history` whenever any `sync_orphan_deletes` row exists with `acknowledged_at IS NULL`. The banner SHALL show a count and an expandable list; each list entry SHALL display `payee_name`, `amount_cents` (formatted), `date`, `plaid_account_id`'s human-readable name (resolved from `plaid_accounts`), `error_reason`, and a button labeled "I deleted it in Actual" that POSTs to the ack endpoint and updates the banner inline via HTMX. When zero unacknowledged orphans exist the banner SHALL NOT render.

#### Scenario: Banner with unacknowledged orphans
- **WHEN** an authenticated user visits `/history` while one or more unacknowledged orphans exist
- **THEN** the page renders a yellow banner above the run list with the count and the expandable list

#### Scenario: Banner hidden when none exist
- **WHEN** an authenticated user visits `/history` and every `sync_orphan_deletes` row has `acknowledged_at IS NOT NULL` (or none exist)
- **THEN** the page renders without the banner

### Requirement: User can acknowledge an orphan

The system SHALL provide an authenticated `POST /history/orphans/:id/ack` endpoint that sets `acknowledged_at = datetime('now')` for the given row if it exists and is currently unacknowledged. The endpoint SHALL re-render the orphan list (or remove the banner entirely if no unacknowledged rows remain) for inline replacement via HTMX.

#### Scenario: Ack an unacknowledged orphan
- **WHEN** an authenticated user POSTs the ack endpoint for an existing unacknowledged orphan id
- **THEN** the row's `acknowledged_at` is set to now, the row disappears from the banner list, and the count decrements

#### Scenario: Ack the last unacknowledged orphan
- **WHEN** the user acks the last remaining unacknowledged orphan
- **THEN** the response removes the banner from the page

#### Scenario: Ack an unknown or already-acknowledged orphan
- **WHEN** the user POSTs the ack endpoint for an id that does not exist or whose `acknowledged_at` is already set
- **THEN** the endpoint responds with 404 (idempotent on already-acknowledged is acceptable but MUST NOT alter the existing `acknowledged_at` timestamp)

### Requirement: Imported totals are queryable over rolling windows

The system SHALL be able to report the total number of transactions imported by a
given owner over a rolling time window, computed as the sum of
`sync_runs.total_imported` for that owner whose `started_at` falls at or after a
cutoff timestamp. This SHALL be derivable from existing stored runs without a
schema change, and SHALL return zero when the owner has no qualifying runs in the
window.

#### Scenario: Sum over a window

- **WHEN** the total imported is requested for an owner over the last N days
- **THEN** the result is the sum of `total_imported` across that owner's sync runs
  with `started_at` within the last N days

#### Scenario: No runs in the window

- **WHEN** an owner has no sync runs with `started_at` within the requested window
- **THEN** the reported total is zero

#### Scenario: Owner scoping

- **WHEN** totals are requested for one owner
- **THEN** only that owner's sync runs contribute to the sum, and other owners'
  runs are excluded

