## Why

There is no way to remove a linked institution from the UI. To stop syncing one, the only option today is editing the SQLite file directly. Plaid also continues to bill (and treat as a live data subscription) any item whose `access_token` is still valid, so leaving stale items linked is wasteful. Plaid's `/item/remove` endpoint is free and is the intended way to tear an item down.

## What Changes

- Add a "Remove" button to every item card on the home page (`GET /`), gated by a JS `confirm()` dialog.
- Add an authenticated `DELETE /link/items/:itemId` route that calls Plaid's `/item/remove` and then marks the local item soft-deleted.
- Introduce a new `plaid_items.status` value `removed`. The column already has no CHECK constraint, so this is a type-only change — no schema migration.
- Filter `removed` items out of the home view and out of sync targeting (so they are never pulled, never appear in the UI, never show up in account-mapping dropdowns).
- Preserve `plaid_accounts`, `account_mappings`, and `sync_account_results` rows for removed items so the history view keeps rendering past runs with the correct account names. New runs SHALL never reference a removed item's accounts.
- If `/item/remove` returns an error other than `ITEM_NOT_FOUND` / `INVALID_ACCESS_TOKEN`, the local record SHALL remain `active` (or whatever it was) and the UI SHALL surface the failure; for the two "already gone on Plaid's side" error codes the local soft-delete proceeds.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `plaid-link`: adds the remove flow (route + UI affordance + Plaid `/item/remove` call) and a new lifecycle status (`removed`) that the existing re-link and listing requirements must respect.
- `transaction-sync`: sync targeting SHALL skip items with status `removed`. A `POST /sync` request that names accounts under a removed item SHALL treat them the same as accounts of an unknown item (sync still succeeds for other accounts; the removed ones simply do not appear in the run).

## Impact

- **Schema**: none. `plaid_items.status` is already untyped at the SQL level. No new migration file.
- **Code**:
  - `src/db/queries.ts` — widen `PlaidItemRow["status"]` and `plaidItems.setStatus` to include `"removed"`; change `plaidItems.listAll()` to filter out `status='removed'`; add `plaidItems.getIncludingRemoved(id)` (or equivalent) only if needed by the delete route's idempotency path.
  - `src/routes/link.ts` — add `DELETE /link/items/:itemId` that decrypts the access token, calls `plaid.itemRemove`, and on success calls `plaidItems.setStatus(id, 'removed')`.
  - `src/plaid/link.ts` (or a sibling) — thin wrapper around `plaid.itemRemove` with the same error-classification pattern used by `classifyPlaidError` in `src/plaid/sync.ts`.
  - `src/views/home.eta` — add a "Remove" button next to the existing Re-link button in `.item-actions`; add a small client-side handler that confirms, POSTs, and reloads.
  - No changes needed in `src/sync/run.ts` — it goes through `plaidItems.listAll()` for grouping; once that filters `removed`, the entire sync path naturally skips them.
  - No changes needed in `src/routes/history.ts` — it queries `plaidAccounts.listAll()` directly with a string fallback, so removed items' historical runs continue to render.
- **External services**: one new call to Plaid's free `/item/remove` endpoint per removal. The Plaid Node SDK already exposed via `src/plaid/client.ts` supports `itemRemove`.
- **Out of scope** (called out in design.md):
  - Hard delete / cleanup tooling for the orphaned `plaid_accounts` and `account_mappings` rows behind a removed item.
  - Re-linking an institution that was previously removed (Plaid issues a new `item_id`, so this just works as a normal new link — no special handling needed).
  - Undo / restore from removed state.
