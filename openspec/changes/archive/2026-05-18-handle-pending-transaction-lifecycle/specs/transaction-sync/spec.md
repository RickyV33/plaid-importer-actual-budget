## ADDED Requirements

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

For each item processed in a sync run, the system SHALL consume `delta.removed` from Plaid `/transactions/sync` and attempt to delete each corresponding Actual transaction. Resolution from Plaid `transaction_id` to Actual transaction id SHALL use a single `getTransactions(actualAccountId, today−30d, today+30d)` call per affected Actual account, building an in-memory `Map<imported_id, actual_id>` from the response. For each removed `transaction_id` found in the map, the system SHALL call `deleteTransaction(actualId)`.

#### Scenario: Removed transaction is found in Actual
- **WHEN** Plaid returns a removed `transaction_id` whose value matches an Actual transaction's `imported_id` within the lookup window
- **THEN** the system calls `deleteTransaction(actualId)` and the row is removed from Actual on the next `actual.sync`

#### Scenario: Removed transaction has no matching Actual row
- **WHEN** Plaid returns a removed `transaction_id` with no matching `imported_id` in the lookup window
- **THEN** the system logs a structured warning identifying the Plaid `transaction_id` and `plaid_account_id` and continues with the rest of the sync; no orphan row is recorded and no UI surface is raised

#### Scenario: Delete throws after the Actual row was resolved
- **WHEN** `deleteTransaction` throws for a resolved Actual id (e.g., Actual unreachable mid-run, transaction id stale)
- **THEN** the system inserts a row into `sync_orphan_deletes` capturing `sync_run_id`, `plaid_account_id`, `plaid_transaction_id`, `payee_name`, `amount_cents`, `date`, and `error_reason`, and the sync run continues for remaining work

#### Scenario: Item has empty removed
- **WHEN** `delta.removed` is empty for an item
- **THEN** the system does not call `getTransactions` for any account associated with that item

## MODIFIED Requirements

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
