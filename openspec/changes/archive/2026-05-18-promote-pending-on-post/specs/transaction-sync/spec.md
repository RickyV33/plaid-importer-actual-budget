## ADDED Requirements

### Requirement: Pending transactions are promoted to posted in-place

For each item processed in a sync run, the system SHALL detect pending→posted promotions in the delta. A promotion is any `added` or `modified` Plaid transaction whose `pending_transaction_id` field is non-null. For each promotion, the system SHALL look up the existing Actual row by `imported_id == pending_transaction_id` (reusing the same `getTransactions(actualAccountId, today−30d, today+30d)` lookup map already built for removals) and:

- If the lookup hits: call `updateTransaction(actualId, { imported_id, amount, cleared: true, date, imported_payee })` to promote the row in place. The `payee` and `payee_name` fields SHALL NOT be passed — the user's resolved payee is preserved, and `payee_name` is not accepted by `updateTransaction`. The corresponding `removed` entry (whose `transaction_id` equals the promotion's `pending_transaction_id`) SHALL be excluded from the deletion list so the just-promoted row is not subsequently deleted.
- If the lookup misses: the promotion SHALL fall through and the posted transaction SHALL be inserted via the existing `importTransactions` path. The corresponding `removed` entry, if present, becomes a normal removal subject to today's no-match warning behavior.

The promotion SHALL be applied regardless of the target mapping's `pending_visible` value — `pending_visible` only controls whether pending rows are ever imported, not how an already-imported pending row is reconciled when it posts.

#### Scenario: Pending posts and the pending row exists in Actual
- **WHEN** a sync delta contains `removed: [{transaction_id: "pend_X"}]` and `added: [{transaction_id: "post_X", pending_transaction_id: "pend_X", pending: false, ...}]`, and Actual has a row with `imported_id="pend_X"` for the mapped account
- **THEN** the system calls `updateTransaction(actualId, { imported_id: "post_X", amount, cleared: true, date, imported_payee })`, the `removed` entry for `pend_X` is dropped from the deletion list, and the row's id, category, notes, and payee remain unchanged

#### Scenario: Pending posts but pending row was never imported (pending_visible=false)
- **WHEN** a sync delta contains a promotion pair as above, but the mapping has `pending_visible=false` so no row with `imported_id="pend_X"` exists in Actual
- **THEN** the promotion falls through, the posted transaction is inserted via `importTransactions` with `cleared=true`, and the orphan `removed` entry for `pend_X` finds no match in the lookup map and emits the existing "no matching Actual txn" structured warning

#### Scenario: Pending posts with amount change on a split transaction
- **WHEN** a Plaid pending transaction was imported into Actual and the user split it into N children (parent amount equal to the sum of children), and the posted transaction arrives with a different amount
- **THEN** the parent row's `amount` and `imported_id` are updated to the posted values, `cleared` becomes true on the parent and (per Actual's cascade) on all children, the child rows are otherwise unchanged, and the parent's `error` field is set by Actual to `{ type: 'SplitTransactionError', version: 1, difference: <delta> }` for the user to reconcile manually in Actual's UI

#### Scenario: Pending posts without amount change on a split transaction
- **WHEN** a split pending transaction posts with the same total amount
- **THEN** the parent row's `imported_id` updates to the posted id, `cleared` becomes true on parent and children, child rows are otherwise unchanged, and `parent.error` remains null

#### Scenario: Promotion's added arrives without the paired removed in the same delta
- **WHEN** a sync delta contains an `added` transaction with `pending_transaction_id="pend_X"` but no matching `removed` entry for `pend_X` in this delta
- **THEN** the system still performs the promotion update on the existing Actual row, and if a `removed` for `pend_X` arrives in a later sync delta it finds no `imported_id` match (the row has been re-keyed to the posted id) and emits the existing "no matching Actual txn" structured warning

#### Scenario: Modified Plaid transaction with pending_transaction_id is treated as a promotion
- **WHEN** the `modified` bucket (not `added`) contains a transaction with `pending_transaction_id` set
- **THEN** the same promotion path applies — the transaction is excluded from the import batch, the paired `removed` is dropped, and `updateTransaction` is called on the matched Actual row

## MODIFIED Requirements

### Requirement: Removed transactions are deleted from Actual

For each item processed in a sync run, the system SHALL consume `delta.removed` from Plaid `/transactions/sync` and attempt to delete each corresponding Actual transaction — EXCEPT entries that are part of a pending→posted promotion pair (see "Pending transactions are promoted to posted in-place"), which SHALL be excluded from the deletion list before processing. Resolution from Plaid `transaction_id` to Actual transaction id SHALL use a single `getTransactions(actualAccountId, today−30d, today+30d)` call per affected Actual account, building an in-memory `Map<imported_id, actual_id>` from the response. This lookup map SHALL be shared with the promotion path (built once per Actual account per run, consumed by both). For each remaining removed `transaction_id` found in the map, the system SHALL call `deleteTransaction(actualId)`.

#### Scenario: Removed transaction is found in Actual
- **WHEN** Plaid returns a removed `transaction_id` whose value matches an Actual transaction's `imported_id` within the lookup window, and the removed entry is NOT part of a promotion pair
- **THEN** the system calls `deleteTransaction(actualId)` and the row is removed from Actual on the next `actual.sync`

#### Scenario: Removed transaction has no matching Actual row
- **WHEN** Plaid returns a removed `transaction_id` with no matching `imported_id` in the lookup window, and the removed entry is NOT part of a promotion pair
- **THEN** the system logs a structured warning identifying the Plaid `transaction_id` and `plaid_account_id` and continues with the rest of the sync; no orphan row is recorded and no UI surface is raised

#### Scenario: Delete throws after the Actual row was resolved
- **WHEN** `deleteTransaction` throws for a resolved Actual id (e.g., Actual unreachable mid-run, transaction id stale)
- **THEN** the system inserts a row into `sync_orphan_deletes` capturing `sync_run_id`, `plaid_account_id`, `plaid_transaction_id`, `payee_name`, `amount_cents`, `date`, and `error_reason`, and the sync run continues for remaining work

#### Scenario: Item has empty removed
- **WHEN** `delta.removed` is empty for an item
- **THEN** the system does not call `getTransactions` for any account associated with that item

#### Scenario: Removed entry is part of a promotion pair
- **WHEN** Plaid returns a removed `transaction_id` "pend_X" in the same delta as an added/modified transaction with `pending_transaction_id="pend_X"`
- **THEN** the removed entry for "pend_X" is excluded from the deletion list, no `deleteTransaction` call is made for it, and the promotion path handles re-keying the existing Actual row
