# transaction-sync Specification

## Purpose
TBD - created by archiving change init-plaid-importer. Update Purpose after archive.
## Requirements
### Requirement: Trigger a sync run with explicit account selection

The system SHALL provide an authenticated `POST /sync` endpoint that accepts a body identifying which Plaid accounts to sync — either `{ "scope": "all" }` to sync every linked account, or `{ "scope": "selected", "plaidAccountIds": [...] }` for a specific subset.

#### Scenario: Sync all accounts
- **WHEN** an authenticated user POSTs `/sync` with `scope=all`
- **THEN** the system queues a sync run including every Plaid account currently linked

#### Scenario: Sync selected accounts
- **WHEN** an authenticated user POSTs `/sync` with `scope=selected` and a non-empty `plaidAccountIds` array
- **THEN** the system queues a sync run including only those accounts

#### Scenario: Sync with empty selection
- **WHEN** an authenticated user POSTs `/sync` with `scope=selected` and an empty array
- **THEN** the endpoint responds with 400 and no sync run is created

### Requirement: Sync uses Plaid cursor-based pagination

The system SHALL pull new transactions per Plaid item using `/transactions/sync`, paging through `added`, `modified`, and `removed` until `has_more` is false, then persisting the new `next_cursor` on the `plaid_items` row.

#### Scenario: First sync of a newly-linked item
- **WHEN** a sync run targets an account whose item has an empty cursor
- **THEN** the system pages through all available historical transactions, applies them to Actual, and stores the resulting cursor

#### Scenario: Subsequent sync of a previously-synced item
- **WHEN** a sync run targets an account whose item has a non-empty cursor
- **THEN** the system pages from that cursor forward, applies the delta to Actual, and stores the updated cursor

#### Scenario: Plaid returns ITEM_LOGIN_REQUIRED
- **WHEN** Plaid responds with an `ITEM_LOGIN_REQUIRED` error during sync
- **THEN** the item's status is set to `requires_relink`, the sync result for affected accounts is recorded with reason=`item_login_required`, and the UI surfaces a "re-link" affordance on the next page render

### Requirement: Transactions are normalized and pushed to Actual

The system SHALL map each Plaid transaction to an Actual transaction with the following correspondences and push the batch via `@actual-app/api.importTransactions` against the mapped Actual account. Before mapping, the system SHALL filter the batch according to the target mapping's `pending_visible` flag (see "Pending transactions are filtered when the mapping disables them").

| Plaid field | Actual field | Notes |
| --- | --- | --- |
| `transaction_id` | `imported_id` | for de-duplication |
| `date` | `date` | ISO date |
| `amount` | `amount` | multiply by -100 and round to integer (Plaid uses positive for outflow, Actual uses negative cents for outflow) |
| `merchant_name` or `name` | `payee_name`, `imported_payee` | prefer `merchant_name` when present |
| `!pending` | `cleared` | pending transactions land as uncleared |

`importTransactions` SHALL be called once per Actual account per sync run with the full batch for that account.

#### Scenario: Successful import of new transactions
- **WHEN** a sync run pulls N new transactions for a mapped account
- **THEN** the system calls `importTransactions(actualAccountId, mapped)` once and records the count returned in `added` as `txns_imported` for that account's result row

#### Scenario: Duplicate transactions across runs
- **WHEN** a sync run pulls transactions whose `transaction_id` matches transactions already imported (via `imported_id`)
- **THEN** Actual's de-duplication on `imported_id` SHALL prevent double-insertion and the count reflects only new transactions

#### Scenario: Pending transaction with pending_visible=true
- **WHEN** a Plaid transaction has `pending=true` and the target mapping has `pending_visible=true`
- **THEN** the resulting Actual transaction has `cleared=false`

### Requirement: Pending transactions are filtered when the mapping disables them

The system SHALL drop transactions where `pending=true` (in either `delta.added` or `delta.modified`) before calling `importTransactions`, for any target whose `account_mappings.pending_visible=false`. When `pending_visible=true`, pending transactions SHALL be imported with `cleared=false` (as already specified).

#### Scenario: Pending transaction with pending_visible=false
- **WHEN** a sync run pulls a Plaid transaction with `pending=true` for an account whose mapping has `pending_visible=false`
- **THEN** that transaction is excluded from the `importTransactions` batch and does not appear in Actual

#### Scenario: Pending transaction with pending_visible=true
- **WHEN** a sync run pulls a Plaid transaction with `pending=true` for an account whose mapping has `pending_visible=true`
- **THEN** that transaction is included in the `importTransactions` batch and lands in Actual as `cleared=false`

#### Scenario: Modified pending transaction with pending_visible=false
- **WHEN** a sync run receives a `delta.modified` Plaid transaction still in `pending=true` state for an account whose mapping has `pending_visible=false`
- **THEN** that transaction is excluded from the `importTransactions` batch

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

### Requirement: One Actual lifecycle per sync run

The system SHALL call `actual.init` and `actual.downloadBudget` exactly once at the start of each sync run, perform all per-account `importTransactions` calls, then call `actual.sync` and `actual.shutdown` exactly once at the end of the run. The Actual local cache directory SHALL persist between runs to enable incremental downloads.

#### Scenario: Multi-account sync run
- **WHEN** a sync run targets accounts across multiple Plaid items
- **THEN** Actual is initialized once, every account's transactions are imported, and Actual is synced and shut down once

#### Scenario: One account's import fails inside a multi-account run
- **WHEN** importing transactions for one account throws an error
- **THEN** the error is recorded for that account's result row, the run continues for remaining accounts, and Actual is still synced and shut down at the end

### Requirement: Sync is observable while running

The system SHALL persist a `sync_runs` row immediately when a sync is triggered with `status=running`, and update that row to `status=success` or `status=failure` when the run terminates. The home page SHALL reflect a running sync without requiring the user to refresh.

#### Scenario: Sync run starts
- **WHEN** a sync run begins
- **THEN** a `sync_runs` row is inserted with `started_at`=now, `status=running`, and `triggered_by=manual`

#### Scenario: Sync run completes
- **WHEN** a sync run finishes
- **THEN** the row's `finished_at` is set, `status` is `success` if every targeted account succeeded or `failure` otherwise, and the home page updates inline via HTMX

### Requirement: Sync excludes removed items

The system SHALL exclude any Plaid item whose `plaid_items.status='removed'` from sync targeting. Accounts under a removed item SHALL NOT be pulled, regardless of whether `POST /sync` was invoked with `scope=all` or with `scope=selected` and an explicit account list naming them. Removed-item accounts SHALL NOT produce `sync_account_results` rows for the current run.

#### Scenario: scope=all skips removed items
- **WHEN** a sync run is invoked with `scope=all` and at least one item has `status='removed'`
- **THEN** the run does not call `/transactions/sync` for that item and writes no `sync_account_results` rows for its accounts

#### Scenario: scope=selected naming a removed item's account
- **WHEN** a sync run is invoked with `scope=selected` and `plaidAccountIds` includes an account whose item has `status='removed'`
- **THEN** that account is silently dropped from the target set; the run continues for any other targeted accounts and the response reflects only the surviving targets

#### Scenario: All selected accounts belong to removed items
- **WHEN** a sync run is invoked with `scope=selected` and every named account belongs to a removed item
- **THEN** the run completes with `status=success` and `total_imported=0`, and writes no `sync_account_results` rows

