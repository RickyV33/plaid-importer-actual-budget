## MODIFIED Requirements

### Requirement: Exchange a public token for an access token

The system SHALL provide an authenticated `POST /link/exchange` endpoint that accepts `{ public_token }` in the body, exchanges it via Plaid's `/item/public_token/exchange`, persists the resulting `access_token` (encrypted at rest) and `item_id` in `plaid_items` with `owner_user_id` set to the authenticated user, fetches the item's accounts via `/accounts/get`, and persists each account in `plaid_accounts` with its `plaid_account_id`, `name`, `mask`, and `type`.

#### Scenario: First-time exchange for a new item
- **WHEN** an authenticated user submits a valid public token for an item not yet linked
- **THEN** the system stores a new `plaid_items` row owned by that user with encrypted access token, fetches and stores all the item's accounts, and responds with the new item's id and account list

#### Scenario: Re-linking an existing item
- **WHEN** an authenticated user submits a public token for an `item_id` already present in `plaid_items` and owned by them
- **THEN** the system updates the existing row's access token (re-encrypted) and refreshes the accounts list, preserving existing account mappings keyed by `plaid_account_id`

### Requirement: Linked items and accounts are discoverable in the UI

The system SHALL provide an authenticated `GET /` route that renders a page listing every linked Plaid item **owned by the requesting user** whose `status` is NOT `removed`, its institution name, its accounts, each account's mapping status (mapped vs unmapped), and the timestamp of the most recent successful sync. Items owned by other users SHALL NOT be listed, and their accounts SHALL NOT appear in any list, mapping dropdown, or selection control. Each item card SHALL expose a "Remove" affordance that, when activated, triggers a confirmation dialog and on confirm issues `DELETE /link/items/:itemId`.

#### Scenario: No items linked yet
- **WHEN** an authenticated user visits `/` and they own no items (or all their items have `status='removed'`)
- **THEN** the page shows an empty-state with a "Link an account" button

#### Scenario: One or more items linked
- **WHEN** an authenticated user visits `/` and they own one or more items with `status != 'removed'`
- **THEN** the page lists those items as separate cards, each grouped with its accounts, status badge, last-sync timestamp, a select-all checkbox, a "Re-link" button when the item status is `requires_relink`, and a "Remove" button

#### Scenario: Another user's items are not visible
- **WHEN** an authenticated user visits `/` while a different user owns linked items
- **THEN** the page does not list, map, or expose those other-owned items in any way

## ADDED Requirements

### Requirement: Item operations are owner-scoped

The system SHALL scope every item-targeting operation (mapping changes, pending-visibility toggles, re-link, mark-active, remove, and sync targeting) to items owned by the authenticated user. A request that names an item or account owned by another user SHALL be treated as if that item does not exist.

#### Scenario: Operating on another user's item
- **WHEN** an authenticated user issues a mapping, re-link, remove, or sync request referencing an item owned by a different user
- **THEN** the system responds 404 (or omits the account from the run) and makes no change to the other user's data

#### Scenario: Operating on an owned item
- **WHEN** an authenticated user issues the same request for an item they own
- **THEN** the operation proceeds normally
