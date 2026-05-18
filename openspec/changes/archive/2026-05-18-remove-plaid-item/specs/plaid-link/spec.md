## ADDED Requirements

### Requirement: Remove a linked Plaid item

The system SHALL provide an authenticated `DELETE /link/items/:itemId` endpoint that calls Plaid's `/item/remove` with the item's decrypted access token and, on success, soft-deletes the local record by setting `plaid_items.status='removed'`. Soft-deleted items SHALL remain in the `plaid_items` table; their `plaid_accounts`, `account_mappings`, and `sync_account_results` rows SHALL NOT be touched.

#### Scenario: Successful removal
- **WHEN** an authenticated user DELETEs `/link/items/:itemId` for an existing `active` (or `requires_relink`) item
- **THEN** the server calls Plaid's `/item/remove` with that item's access token, sets `plaid_items.status='removed'`, and responds 204

#### Scenario: Plaid says the item is already gone
- **WHEN** Plaid's `/item/remove` returns `ITEM_NOT_FOUND` or `INVALID_ACCESS_TOKEN`
- **THEN** the server treats the removal as successful, sets `plaid_items.status='removed'`, and responds 204

#### Scenario: Plaid returns any other error
- **WHEN** Plaid's `/item/remove` returns a non-2xx response with any other error code
- **THEN** the server leaves `plaid_items.status` unchanged and responds 502 with the upstream error code, and the home page on the next render still lists the item

#### Scenario: Unknown item
- **WHEN** an authenticated user DELETEs `/link/items/:itemId` for an `itemId` not present in `plaid_items`
- **THEN** the server responds 404 and does not call Plaid

#### Scenario: Idempotent re-delete
- **WHEN** an authenticated user DELETEs `/link/items/:itemId` for an item already in `status='removed'`
- **THEN** the server responds 204 without calling Plaid

### Requirement: Removed items are excluded from the home view

The system SHALL hide items whose `plaid_items.status='removed'` from the home page (`GET /`). Accounts under removed items SHALL NOT appear in any account list, mapping dropdown, or selection control on the home page.

#### Scenario: Removed item disappears from the home page
- **WHEN** an authenticated user removes an item and the home page renders on the next request
- **THEN** the page does not list a card, accounts, or mapping controls for that item

#### Scenario: Removed item is the only item
- **WHEN** the user removes the only linked item
- **THEN** the home page renders the same empty-state as if no items had ever been linked

## MODIFIED Requirements

### Requirement: Linked items and accounts are discoverable in the UI

The system SHALL provide an authenticated `GET /` route that renders a page listing every linked Plaid item whose `status` is NOT `removed`, its institution name, its accounts, each account's mapping status (mapped vs unmapped), and the timestamp of the most recent successful sync. Each item card SHALL expose a "Remove" affordance that, when activated, triggers a confirmation dialog and on confirm issues `DELETE /link/items/:itemId`.

#### Scenario: No items linked yet
- **WHEN** an authenticated user visits `/` and no items are linked (or all linked items have `status='removed'`)
- **THEN** the page shows an empty-state with a "Link an account" button

#### Scenario: One or more items linked
- **WHEN** an authenticated user visits `/` and one or more items have `status != 'removed'`
- **THEN** the page lists those items as separate cards, each grouped with its accounts, status badge (`active` or `re-link needed`), last-sync timestamp, a per-item select-all checkbox, a "Re-link" button when the item status is `requires_relink`, and a "Remove" button

#### Scenario: Remove button activated
- **WHEN** the user clicks "Remove" on an item card
- **THEN** the page shows a confirmation dialog naming the institution and explaining that this stops syncing and disconnects from Plaid; on confirm the page issues `DELETE /link/items/:itemId` and reloads
