## Why

After linking a Plaid connection, users have no way to add or remove which accounts are shared — their only option is to remove the entire connection and re-link from scratch. This blocks a common workflow where someone opens a new bank account and wants to include it in syncing.

## What Changes

- Add a **"Manage accounts"** button per connection on the home page (shown when status is `active`, not `requires_relink`)
- Clicking it opens Plaid Link in update mode with `account_selection_enabled: true`, letting the user add or remove account selections
- On completion, the app re-fetches the item's accounts from Plaid:
  - Newly selected accounts are upserted as `access_status = 'active'`
  - Accounts no longer returned by Plaid are marked `access_status = 'deselected'`
- Deselected accounts are **excluded from sync** but **still shown in the UI** with a "deselected" badge
- Existing profile mappings for deselected accounts are preserved (restored automatically if the account is re-selected)
- New DB migration adds `access_status` column to `plaid_accounts`

## Capabilities

### New Capabilities

- `account-selection-management`: UI flow and backend endpoints to re-open Plaid Link for account selection on an existing connection, sync the resulting account list, and track per-account access status

### Modified Capabilities

- `plaid-link`: New endpoints (`POST /link/items/:itemId/account-select-token`, `POST /link/items/:itemId/refresh-accounts`) and a new `account_selection_enabled` link token mode; existing `listByOwner` query filtered to active accounts only

## Impact

- `src/db/migrations/` — new migrations for `access_status` and `persistent_account_id` columns
- `src/db/queries.ts` — `upsertReconciled`/`findStaleDuplicate`/`reassignMappings` to reconcile re-added accounts that Plaid returns under a new `account_id`
- `src/db/queries.ts` — `PlaidAccountRow` type, `upsert`, `listByOwner`, new `listByOwnerAll`, `setAccessStatus`, `deselectMissing`
- `src/plaid/link.ts` — new `createAccountSelectLinkToken` function
- `src/routes/link.ts` — two new POST routes
- `src/routes/home.ts` — switch to `listByOwnerAll` for display, pass `accessStatus` to view
- `src/views/home.eta` — "Manage accounts" button, deselected account row styling, JS handler
- `src/i18n/en.ts`, `es.ts` — new string keys
