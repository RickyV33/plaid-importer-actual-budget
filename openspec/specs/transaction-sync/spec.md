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

The system SHALL map each Plaid transaction to an Actual transaction with the following correspondences and push the batch via `@actual-app/api.importTransactions` against the mapped Actual account.

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

#### Scenario: Pending transaction
- **WHEN** a Plaid transaction has `pending=true`
- **THEN** the resulting Actual transaction has `cleared=false`

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

