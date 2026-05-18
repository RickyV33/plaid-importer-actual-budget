## ADDED Requirements

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
