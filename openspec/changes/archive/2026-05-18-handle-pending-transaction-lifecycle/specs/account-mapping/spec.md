## ADDED Requirements

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
