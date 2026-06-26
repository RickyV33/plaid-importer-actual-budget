# account-selection-management Specification

## Purpose
TBD - created by archiving change manage-accounts. Update Purpose after archive.
## Requirements
### Requirement: Users can manage account selections on an existing Plaid connection

The system SHALL provide a flow for authenticated users to re-open Plaid Link in account-selection update mode for an existing connection, allowing them to add or remove which accounts are shared. The flow SHALL consist of:
1. `POST /link/items/:itemId/account-select-token` — creates a Plaid Link token with `account_selection_enabled: true`
2. Client opens Plaid Link with that token
3. On success, client calls `POST /link/items/:itemId/refresh-accounts` to sync the updated account list

#### Scenario: Generate an account-selection link token
- **WHEN** an authenticated user POSTs to `/link/items/:itemId/account-select-token` for an item they own
- **THEN** the response is 200 with `{ "link_token": "<token>" }` where the token was created with `access_token` and `account_selection_enabled: true`

#### Scenario: Unknown item
- **WHEN** the requested `itemId` does not exist or is not owned by the authenticated user
- **THEN** the endpoint responds 404

#### Scenario: Plaid error during token creation
- **WHEN** Plaid returns a non-2xx response
- **THEN** the endpoint responds 502

### Requirement: Account list is refreshed after account selection

After the user completes the Plaid Link account-selection flow, the system SHALL synchronize the local account list with what Plaid currently authorizes for the item. Accounts returned by Plaid SHALL be upserted with `access_status = 'active'`. Accounts in the local DB for that item that are NOT returned by Plaid SHALL have their `access_status` set to `'deselected'`.

#### Scenario: User adds a new account
- **WHEN** `POST /link/items/:itemId/refresh-accounts` is called and Plaid returns an account not previously in the DB
- **THEN** a new `plaid_accounts` row is inserted with `access_status = 'active'`

#### Scenario: User re-selects a previously deselected account
- **WHEN** `POST /link/items/:itemId/refresh-accounts` is called and Plaid returns an account that was `access_status = 'deselected'`
- **THEN** that account's `access_status` is updated to `'active'`

#### Scenario: User removes an account selection
- **WHEN** `POST /link/items/:itemId/refresh-accounts` is called and an account in the DB is not present in Plaid's response
- **THEN** that account's `access_status` is set to `'deselected'`

#### Scenario: No change in selection
- **WHEN** `POST /link/items/:itemId/refresh-accounts` is called and Plaid returns the same accounts as currently active in the DB
- **THEN** all accounts remain `access_status = 'active'` and no rows are deleted

### Requirement: Re-added accounts reuse the existing record despite a new Plaid account_id

Plaid does not guarantee a stable `account_id` when an account is removed and re-added via account selection; it may issue a new `account_id` for the same underlying account. The system SHALL store each account's `persistent_account_id` and, when refreshing accounts, reconcile an incoming account against any existing record that represents the same real-world account but under a different `account_id`. A match SHALL be determined by `persistent_account_id` when available, otherwise by a deselected record within the same item sharing the same `name`, `mask`, and `type`. On a match, the system SHALL migrate the existing record's profile and actual-account mappings onto the new `account_id` and remove the stale record, so that no duplicate account row is created and the user's mappings are preserved.

#### Scenario: Re-added account matched by persistent_account_id
- **WHEN** `refresh-accounts` receives an account whose `persistent_account_id` matches an existing record under a different `account_id`
- **THEN** the existing record's mappings are moved to the new `account_id`, the stale record is deleted, and exactly one active record remains for that account

#### Scenario: Re-added account matched by identity fallback
- **WHEN** `refresh-accounts` receives an account with no stored persistent match, but a deselected record in the same item has the same `name`, `mask`, and `type`
- **THEN** that deselected record's mappings are migrated to the new `account_id` and the deselected record is removed

#### Scenario: Distinct account is not merged
- **WHEN** `refresh-accounts` receives a genuinely new account whose identity and `persistent_account_id` do not match any existing record
- **THEN** a new active record is inserted and no existing record is altered

### Requirement: Users can remove a deselected account

The system SHALL allow an authenticated user to permanently remove an account that is `access_status = 'deselected'` via `DELETE /link/items/:itemId/accounts/:plaidAccountId`, scoped to accounts under items they own. Removing the account SHALL delete its `plaid_accounts` row and cascade-delete its profile and actual-account mappings. Active accounts SHALL NOT be removable through this endpoint, since they would reappear on the next account refresh. The home page SHALL surface a remove (trash) action only on deselected account rows.

#### Scenario: Remove a deselected account
- **WHEN** an authenticated user issues `DELETE /link/items/:itemId/accounts/:plaidAccountId` for a `deselected` account under an item they own
- **THEN** the account row and its mappings are deleted and the endpoint responds 204

#### Scenario: Attempt to remove an active account
- **WHEN** the targeted account exists but is `access_status = 'active'`
- **THEN** the endpoint responds 409 and the account is not deleted

#### Scenario: Unknown account or wrong owner
- **WHEN** the account does not exist, is not under the named item, or belongs to another user
- **THEN** the endpoint responds 404 and no data is changed

### Requirement: Deselected accounts are excluded from sync but visible in the UI

Accounts with `access_status = 'deselected'` SHALL be excluded from all sync operations. They SHALL still appear on the home page — in both the connections list and the profile mapping tables — with a visual "Not syncing" indicator and an accompanying help tooltip explaining that the account is no longer shared from the bank and will not sync until re-added. Their profile mappings SHALL be preserved and restored automatically if the account is re-selected.

#### Scenario: Deselected account excluded from sync
- **WHEN** a sync run is triggered (scoped to "all" or "selected")
- **THEN** accounts with `access_status = 'deselected'` are not included in the sync, regardless of scope

#### Scenario: Deselected account visible in UI
- **WHEN** the authenticated user visits the home page
- **THEN** deselected accounts appear in the connection's account list with a "Not syncing" badge (and help tooltip) and their sync checkboxes disabled, and the same indicator appears beside the account in the profile mapping tables

#### Scenario: Re-selected account resumes syncing
- **WHEN** a previously deselected account is re-selected via the manage-accounts flow and refresh is called
- **THEN** the account's `access_status` returns to `'active'` and it is included in subsequent syncs

