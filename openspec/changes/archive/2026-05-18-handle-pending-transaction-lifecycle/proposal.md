## Why

Plaid delivers a pending-then-posted transaction as a `removed` event for the pending `transaction_id` plus an `added` event for a new posted `transaction_id` — they are distinct rows linked by `pending_transaction_id`. The current sync ignores `delta.removed` entirely and imports both, so every settled pending leaves a stale uncleared duplicate in Actual that the user must manually clean up. Actual's fuzzy dedup cannot save us: when both the existing and incoming rows have `imported_id` populated, `importTransactions` (hard-coded `strictIdChecking=true`) skips the fuzzy fallback. Pending transactions are also often wrong on amount (restaurant tips, gas pre-auths) and noisy when they never settle (released holds), so most users prefer to wait for the posted version.

## What Changes

- Add a per-mapping `pending_visible` toggle (default **off**) controlling whether pending transactions are imported into Actual for that mapping.
- When `pending_visible=false`, filter out pending transactions from both `added` and `modified` before calling `importTransactions`.
- Consume `delta.removed` from Plaid `/transactions/sync`: for each removed Plaid transaction, look up the matching Actual transaction by `imported_id` (via `getTransactions(account, today−30d, today+30d)`) and call `deleteTransaction`.
- If a removed transaction has no matching Actual row, log a structured warning and continue (no user-facing surface — see "out of scope").
- If `deleteTransaction` throws (Actual unreachable, etc.), record the failed delete in a new `sync_orphan_deletes` table with the Plaid txn metadata. The history page surfaces unacknowledged orphans with an "I deleted it in Actual" ack button.
- Update the home page UI to render the per-mapping toggle (with a tooltip describing on/off behavior) next to the mapping dropdown.
- Update the history page to render the orphan-delete banner and ack action.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `transaction-sync`: pending transactions are filtered when the mapping's `pending_visible=false`; `delta.removed` is consumed and translates to `deleteTransaction` calls in Actual; failed deletes are recorded as orphan rows.
- `account-mapping`: each mapping carries a `pending_visible` boolean (default `false`), settable from the home page.
- `sync-history`: unacknowledged orphan-delete rows are surfaced on the history page with a per-row ack action that marks them acknowledged.

## Impact

- **Schema**: `account_mappings` gains a `pending_visible INTEGER NOT NULL DEFAULT 0` column. New table `sync_orphan_deletes (id, sync_run_id, plaid_account_id, plaid_transaction_id, payee_name, amount_cents, date, error_reason, created_at, acknowledged_at NULL)`. New migration `0002_*.sql`.
- **Code**: `src/sync/run.ts` (delete loop + filter), `src/actual/import.ts` (filter helper or move to sync layer), `src/db/queries.ts` (new queries for mappings flag, orphan rows), `src/routes/sync.ts` and `src/routes/history.ts` (orphan ack endpoint), `src/views/home.eta` and `src/views/history.eta` (UI), Eta partials as needed.
- **Actual API surface used**: adds dependence on `getTransactions(accountId, startDate, endDate)` and `deleteTransaction(id)` from `@actual-app/api` (already installed; not currently called).
- **Out of scope** (deferred, called out in design.md): a local imported-Plaid-txn tracking table to distinguish "never imported" from "missing in Actual" (the phantom-orphan edge case for `pending_visible=false`); retry-on-failed-delete; sweep-on-toggle-flip (existing pending rows when the user flips the toggle from on to off).
- **Migration of existing data**: none — `pending_visible` defaults to off matching the old "you'd have ghosts if you waited" behavior except now there are no new ghosts going forward; existing duplicates already in Actual are not touched.
