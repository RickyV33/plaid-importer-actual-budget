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

The system SHALL provide an authenticated endpoint to map a Plaid account to an Actual account **within a specific profile**, upserting a row in `profile_account_mappings` keyed by `(profile_id, plaid_account_id)`. At most one mapping SHALL exist per `(profile_id, plaid_account_id)` pair, but the same `plaid_account_id` MAY be mapped independently across multiple profiles. Both the profile and the Plaid account SHALL be owned by the requesting user.

#### Scenario: First mapping within a profile
- **WHEN** an authenticated user maps a previously-unmapped Plaid account to an Actual account within a profile they own
- **THEN** the system inserts a new `profile_account_mappings` row for `(profile, plaid account)` and the page reflects the mapping

#### Scenario: Changing an existing mapping within a profile
- **WHEN** the user submits a new `actualAccountId` for an account already mapped in that profile
- **THEN** the system updates that profile's row in place; no new row is created and other profiles' mappings are unaffected

#### Scenario: Same account mapped in a second profile
- **WHEN** the user maps the same Plaid account within a different profile
- **THEN** a separate `profile_account_mappings` row is created for the second profile, independent of the first

#### Scenario: Unknown or unowned profile/account
- **WHEN** the profile or Plaid account does not exist or is owned by another user
- **THEN** the endpoint responds 404 and stores nothing

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

Each row in `profile_account_mappings` SHALL carry a `pending_visible` boolean (stored as `INTEGER NOT NULL DEFAULT 0`) controlling whether pending transactions for that Plaid account are imported into the profile's target Actual account. The setting is **per profile**: the same Plaid account MAY show pending in one profile and hide it in another. New mappings default to `false`.

#### Scenario: New mapping defaults to pending-hidden
- **WHEN** a user creates a new mapping within a profile
- **THEN** the row is persisted with `pending_visible=0`

#### Scenario: Independent pending setting across profiles
- **WHEN** the same Plaid account is mapped in two profiles and `pending_visible` is enabled in one
- **THEN** only that profile imports pending transactions for the account; the other profile is unaffected

#### Scenario: Folded mappings preserve pending-visible
- **WHEN** the migration seed folds an existing `account_mappings` row into `profile_account_mappings` under the Default profile
- **THEN** the new row preserves the original `pending_visible` value

### Requirement: User can toggle pending-visible per mapping

The system SHALL provide an authenticated endpoint that updates `pending_visible` on a specific `(profile_id, plaid_account_id)` mapping owned by the requesting user, and SHALL respond with the updated toggle state.

#### Scenario: User enables pending-visible for a profile
- **WHEN** an authenticated user enables pending-visible for a Plaid account within a profile they own
- **THEN** that profile's mapping `pending_visible` becomes `1` and that profile's next drain includes pending transactions for the account

#### Scenario: User disables pending-visible for a profile
- **WHEN** the user disables pending-visible for a mapping
- **THEN** that profile's `pending_visible` becomes `0` and subsequent drains for that profile filter pending out; pending rows already in that budget are NOT removed by the toggle (affects future drains only)

### Requirement: Mapping controls render in consistent aligned columns

The home page SHALL render the "Mapped to" dropdown and the "show pending" toggle in consistent, aligned columns across every account row, regardless of whether the account is currently mapped. The space for the "show pending" control SHALL be reserved on unmapped rows so controls line up vertically across all banks.

#### Scenario: Aligned across mapped and unmapped rows
- **WHEN** the home page renders accounts where some are mapped (showing the pending toggle) and some are not
- **THEN** the "Mapped to" dropdowns align in one column and the "show pending" controls align in one column across all rows

#### Scenario: Consistent across institutions
- **WHEN** accounts from multiple banks/profiles are listed
- **THEN** the mapping and pending controls present in the same aligned layout for every institution

