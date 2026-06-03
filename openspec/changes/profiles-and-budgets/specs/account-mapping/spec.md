## MODIFIED Requirements

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
