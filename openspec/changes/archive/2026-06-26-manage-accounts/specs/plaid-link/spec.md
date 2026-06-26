## MODIFIED Requirements

### Requirement: Linked items and accounts are discoverable in the UI

The system SHALL provide an authenticated `GET /` route that renders a page listing every linked Plaid item **owned by the requesting user** whose `status` is NOT `removed`, its institution name, its accounts (both `active` and `deselected`), each account's mapping status (mapped vs unmapped), and the timestamp of the most recent successful sync. Items owned by other users SHALL NOT be listed, and their accounts SHALL NOT appear in any list, mapping dropdown, or selection control. Each item card SHALL expose a "Remove" affordance that, when activated, triggers a confirmation dialog and on confirm issues `DELETE /link/items/:itemId`. Each item card with status `active` SHALL expose a "Manage accounts" button that opens the account-selection flow. Each item card with status `requires_relink` SHALL expose a "Re-link" button instead. Accounts with `access_status = 'deselected'` SHALL be shown with a visual "Not syncing" indicator (with help tooltip) and their sync checkboxes disabled.

#### Scenario: No items linked yet
- **WHEN** an authenticated user visits `/` and they own no items (or all their items have `status='removed'`)
- **THEN** the page shows an empty-state with a "Link an account" button

#### Scenario: One or more items linked
- **WHEN** an authenticated user visits `/` and they own one or more items with `status != 'removed'`
- **THEN** the page lists those items as separate cards, each grouped with its accounts (active and deselected), status badge, last-sync timestamp, a select-all checkbox, a "Manage accounts" button when status is `active`, a "Re-link" button when status is `requires_relink`, and a "Remove" button

#### Scenario: Deselected account shown with indicator
- **WHEN** the home page renders an item that has one or more accounts with `access_status = 'deselected'`
- **THEN** those accounts appear in the account list with a "Not syncing" badge and their sync checkboxes are disabled

#### Scenario: Another user's items are not visible
- **WHEN** an authenticated user visits `/` while a different user owns linked items
- **THEN** the page does not list, map, or expose those other-owned items in any way
