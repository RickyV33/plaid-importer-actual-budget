## 1. Database

- [x] 1.1 Add migration `0010_account_access_status.sql` — `ALTER TABLE plaid_accounts ADD COLUMN access_status TEXT NOT NULL DEFAULT 'active'`
- [x] 1.2 Update `PlaidAccountRow` type to include `access_status: "active" | "deselected"`
- [x] 1.3 Add `listByOwnerAll` query (returns all accounts regardless of access_status, for UI display)
- [x] 1.4 Filter `listByOwner` to `WHERE access_status = 'active'` (sync path)
- [x] 1.5 Add `deselectMissing(itemId, activeIds[])` — marks accounts not in activeIds as deselected

## 2. Plaid Client

- [x] 2.1 Add `createAccountSelectLinkToken(accessToken)` to `src/plaid/link.ts` — same as update token but with `account_selection_enabled: true`

## 3. Backend Routes

- [x] 3.1 Add `POST /link/items/:itemId/account-select-token` route — returns a link token for account selection
- [x] 3.2 Add `POST /link/items/:itemId/refresh-accounts` route — fetches accounts from Plaid, upserts active ones, calls `deselectMissing` for the rest

## 4. Home Route & View

- [x] 4.1 Switch `home.ts` to use `listByOwnerAll` so deselected accounts appear in the UI
- [x] 4.2 Add `accessStatus` to `HomeAccount` type and pass it through `toHomeAccount`
- [x] 4.3 Add "Manage accounts" button to item card (shown when status is `active`, not `requires_relink`)
- [x] 4.4 Render deselected accounts with a "deselected" badge and disabled checkbox
- [x] 4.5 Add JS handler for "Manage accounts" button — fetches account-select token, opens Plaid Link, calls refresh-accounts on success, reloads

## 5. i18n

- [x] 5.1 Add `home.manageAccounts` and `home.notSyncing`/`home.notSyncingHelp` keys to `en.ts` and `es.ts`

## 6. Stable-id reconciliation (bug fix)

- [x] 6.1 Add migration `0011_account_persistent_id.sql` — `persistent_account_id` column + `(item_id, persistent_account_id)` index
- [x] 6.2 Store `persistent_account_id` on upsert (exchange + refresh); add `persistent_account_id` to `PlaidAccountRow`
- [x] 6.3 Add `upsertReconciled` / `findStaleDuplicate` / `reassignMappings` to reconcile re-added accounts with a new `account_id`
- [x] 6.4 Use `upsertReconciled` in `refresh-accounts` so re-added accounts reuse the existing record and keep their mappings
- [x] 6.5 Tests for persistent-id match, identity fallback, and no-false-merge

## 7. Remove a deselected account

- [x] 7.1 Add `plaidAccounts.deleteByPlaidId` (cascades mappings via FK)
- [x] 7.2 Add `DELETE /link/items/:itemId/accounts/:plaidAccountId` route — owner-scoped, 409 for active accounts, 404 for unknown/wrong owner
- [x] 7.3 Add a remove (trash) button on deselected account rows + confirm/JS handler
- [x] 7.4 Add `home.accountRemoveConfirm` / `home.accountRemoveFailed` i18n keys (en + es)
- [x] 7.5 Test `deleteByPlaidId` removes the account and cascades its mappings
