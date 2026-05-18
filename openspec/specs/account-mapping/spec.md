# account-mapping Specification

## Purpose
TBD - created by archiving change init-plaid-importer. Update Purpose after archive.
## Requirements
### Requirement: List candidate Actual accounts for mapping

The system SHALL provide an authenticated `GET /accounts/actual` endpoint that opens the configured Actual budget, returns the full list of Actual accounts (id and name), and closes the budget. Results MAY be cached in memory for up to 60 seconds to avoid repeated open/close cycles during a single mapping session.

#### Scenario: Mapping UI requests Actual accounts
- **WHEN** an authenticated user requests the candidate list
- **THEN** the response is a JSON array of `{ id, name }` objects representing every Actual account

#### Scenario: Actual server unreachable
- **WHEN** the Actual server cannot be reached
- **THEN** the endpoint responds with 502 and a message identifying the connectivity failure

### Requirement: Persist a one-to-one mapping per Plaid account

The system SHALL provide an authenticated `POST /accounts/:plaidAccountId/mapping` endpoint that accepts `{ actualAccountId }` in the body and upserts a row in `account_mappings` linking the Plaid account to the Actual account. At most one mapping SHALL exist per `plaid_account_id`.

#### Scenario: First mapping for a Plaid account
- **WHEN** an authenticated user submits a mapping for a previously-unmapped Plaid account
- **THEN** the system inserts a new `account_mappings` row and the home page reflects the new mapping

#### Scenario: Changing an existing mapping
- **WHEN** an authenticated user submits a new `actualAccountId` for an already-mapped Plaid account
- **THEN** the system updates the existing row in place; no new row is created

#### Scenario: Unknown Plaid account
- **WHEN** the `plaidAccountId` does not exist in `plaid_accounts`
- **THEN** the endpoint responds with 404

#### Scenario: Unknown Actual account
- **WHEN** the submitted `actualAccountId` does not appear in the most recent Actual accounts fetch
- **THEN** the endpoint responds with 400 with a message indicating the Actual account was not found

### Requirement: Clearing a mapping

The system SHALL provide an authenticated `DELETE /accounts/:plaidAccountId/mapping` endpoint that removes the mapping for the given Plaid account, if any.

#### Scenario: Mapping exists and is cleared
- **WHEN** an authenticated user DELETEs the mapping for a mapped Plaid account
- **THEN** the row is removed and the account is shown as unmapped on the home page

#### Scenario: Mapping does not exist
- **WHEN** an authenticated user DELETEs the mapping for an unmapped Plaid account
- **THEN** the endpoint responds with 204 (idempotent)

### Requirement: Sync requires mapping

The system SHALL refuse to sync transactions for any Plaid account that has no mapping. Sync runs that target unmapped accounts SHALL be recorded as failures for those accounts with reason "unmapped" without aborting other selected accounts.

#### Scenario: Sync requested for an unmapped account
- **WHEN** a sync run includes an unmapped Plaid account
- **THEN** that account's `sync_account_results` row records status=`skipped` and reason=`unmapped`, and the sync proceeds for any other selected accounts that are mapped

### Requirement: Each mapping carries a pending-visible toggle

Each row in `account_mappings` SHALL carry a `pending_visible` boolean (stored as `INTEGER NOT NULL DEFAULT 0`) controlling whether pending transactions from the linked Plaid account are imported into the linked Actual account. New mappings default to `false`. Existing mappings created before this change SHALL also have `pending_visible=false` after migration.

#### Scenario: New mapping defaults to pending-hidden
- **WHEN** a user creates a new mapping via `POST /accounts/:plaidAccountId/mapping`
- **THEN** the row is persisted with `pending_visible=0`

#### Scenario: Existing mappings after migration
- **WHEN** the schema migration introducing `pending_visible` runs against a database with existing `account_mappings` rows
- **THEN** every existing row has `pending_visible=0` after migration completes

### Requirement: User can toggle pending-visible per mapping

The system SHALL provide an authenticated `POST /accounts/:plaidAccountId/mapping/pending-visible` endpoint that accepts `{ value: boolean }` in the body and updates the `pending_visible` column on the existing mapping. The endpoint SHALL respond with the updated row's state (rendered as the toggle partial for HTMX). The home page SHALL render the toggle next to each mapping dropdown with a tooltip describing the on/off behaviors.

#### Scenario: User enables pending-visible
- **WHEN** an authenticated user submits `value=true` for a mapped Plaid account
- **THEN** the mapping row's `pending_visible` becomes `1` and the next sync run includes pending transactions for that account

#### Scenario: User disables pending-visible
- **WHEN** an authenticated user submits `value=false` for a mapped Plaid account
- **THEN** the mapping row's `pending_visible` becomes `0` and subsequent sync runs filter pending transactions out for that account; existing pending rows already in Actual are NOT removed by this action (toggle affects future syncs only)

#### Scenario: Toggle for an unmapped account
- **WHEN** an authenticated user POSTs the toggle endpoint for a `plaidAccountId` that has no mapping row
- **THEN** the endpoint responds with 404 (no mapping to update)

#### Scenario: Toggle persists across mapping updates
- **WHEN** an authenticated user changes the `actualAccountId` for an already-mapped Plaid account
- **THEN** the existing `pending_visible` value is preserved (the upsert MUST NOT reset `pending_visible` to default)

