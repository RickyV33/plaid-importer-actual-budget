## ADDED Requirements

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
