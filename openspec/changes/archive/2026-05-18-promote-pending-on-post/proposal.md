## Why

When a Plaid pending transaction posts, today's importer hard-deletes the pending row in Actual and inserts a fresh row for the posted transaction. Any user edits on the pending row — category, notes, payee renames, split children — are lost on every posting event. Plaid already tells us the two are linked via `pending_transaction_id`; we can update the existing row in place instead.

## What Changes

- Detect pending→posted promotions inside each sync delta: any `added` (or `modified`) transaction with `pending_transaction_id` set is paired with the corresponding `removed` entry whose `transaction_id` equals that `pending_transaction_id`.
- For each pair, look up the existing Actual row by `imported_id == pending_transaction_id` and call `updateTransaction` to set the new `imported_id` (posted id), `amount`, `cleared: true`, `date`, and `imported_payee`. Do NOT pass `payee` or `payee_name` — preserve whatever payee the user has on the row.
- Drop the paired `removed` entry from the delete bucket so we don't delete the row we just promoted.
- Reuse the existing `imported_id` lookup map already built for removals — no extra `getTransactions` calls.
- Removals with no promotion partner continue through today's `deleteTransaction` path unchanged.
- When the lookup misses (e.g., `pending_visible=false` or user manually deleted the pending row), the promotion falls through and the posted transaction inserts fresh via the existing `importTransactions` path.

## Capabilities

### New Capabilities
<!-- none — this change extends the existing transaction-sync capability -->

### Modified Capabilities
- `transaction-sync`: adds a new requirement for in-place promotion of pending→posted transactions, and narrows the existing "Removed transactions are deleted from Actual" requirement to scope it to removals that are NOT part of a promotion pair.

## Impact

- **Code**: `src/sync/run.ts` (delta bucketing — new "promotions" bucket alongside imports/removals), `src/sync/lifecycle.ts` (new `processPromotions` function; existing `processRemovals` consumes the filtered removals list).
- **Tests**: `src/sync/lifecycle.test.ts` gains coverage for promotion pairing, the fall-through case when the pending row isn't in Actual, and the unchanged delete path for orphan removals.
- **Spec**: `openspec/specs/transaction-sync/spec.md` — one requirement modified, one added.
- **Dependencies**: none. Uses existing `@actual-app/api` `updateTransaction` method.
- **Library quirk**: `api.updateTransaction()` in `@actual-app/api` is fire-and-forget (writes complete in background, errors surface as unhandled rejections rather than thrown errors). We rely on the existing `withActual` flow's terminal `actual.sync()` to flush; per-promotion error capture is best-effort. See `design.md` for details.
- **User-visible**: split parents whose amount changes between pending and posted will surface Actual's native `SplitTransactionError` badge with the difference — same UX as Actual's own split-import flow, strictly better than today's silent loss of all split children.
