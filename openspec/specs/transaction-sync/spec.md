# transaction-sync Specification

## Purpose
TBD - created by archiving change init-plaid-importer. Update Purpose after archive.
## Requirements
### Requirement: Trigger a sync run with explicit account selection

The system SHALL provide an authenticated `POST /sync` endpoint that accepts a
body identifying which Plaid accounts to sync — either `{ "scope": "all" }` to
sync every linked account, or `{ "scope": "selected", "plaidAccountIds": [...] }`
for a specific subset. When the per-connection sync ceiling is enabled (see
sync-rate-limit), the endpoint SHALL exclude accounts whose connection is at or
above its limit before starting the run, sync the remaining accounts, and report
the skipped connections in the response.

The response SHALL include the overall total of transactions imported and a
per-connection breakdown so the UI can present results for each connection
individually. For each connection that was synced, the breakdown SHALL include
the connection's identifier, the number of transactions imported for that
connection in this run, and that connection's updated last-synced timestamp. Each
skipped connection SHALL be reported with its identifier, a display name, and a
retry hint.

#### Scenario: Sync all accounts

- **WHEN** an authenticated user POSTs `/sync` with `scope=all`
- **THEN** the system queues a sync run including every linked account whose
  connection is under its ceiling

#### Scenario: Sync selected accounts

- **WHEN** an authenticated user POSTs `/sync` with `scope=selected` and a
  non-empty `plaidAccountIds` array
- **THEN** the system queues a sync run including only those accounts whose
  connection is under its ceiling

#### Scenario: Sync with empty selection

- **WHEN** an authenticated user POSTs `/sync` with `scope=selected` and an empty
  array
- **THEN** the endpoint responds with 400 and no sync run is created

#### Scenario: Response includes a per-connection breakdown

- **WHEN** a sync run completes for one or more connections
- **THEN** the response includes the overall imported total and, for each synced
  connection, that connection's identifier, its imported count for the run, and
  its updated last-synced timestamp

#### Scenario: Some connections over the ceiling

- **WHEN** a sync request includes accounts from a connection at or above its
  per-connection ceiling
- **THEN** those accounts are excluded from the run, the remaining accounts sync
  normally, and the response reports the skipped connections with their identifier
  and a retry hint

### Requirement: Sync uses Plaid cursor-based pagination

The system SHALL pull new transactions per Plaid item using `/transactions/sync` exactly once per item per run, paging through `added`, `modified`, and `removed` until `has_more` is false. The pulled delta SHALL be appended to the `plaid_txn_events` journal and the item's `next_cursor` SHALL be persisted on the `plaid_items` row **in the same database transaction**. The number of Plaid pulls per run SHALL equal the number of targeted items, independent of how many profiles consume each item.

#### Scenario: First sync of a newly-linked item
- **WHEN** a sync run pulls an item whose cursor is empty
- **THEN** the system pages through all available historical transactions, appends them to the journal, and stores the resulting cursor atomically

#### Scenario: One pull feeds many profiles
- **WHEN** an item is connected to multiple profiles
- **THEN** the system pulls from Plaid once, and each profile is served from the journal during drain — no additional Plaid pull is made per profile

#### Scenario: Plaid returns ITEM_LOGIN_REQUIRED
- **WHEN** Plaid responds with an `ITEM_LOGIN_REQUIRED` error during the pull
- **THEN** the item's status is set to `requires_relink`, no events are appended for that item, the cursor is unchanged, and affected accounts' results record reason=`item_login_required`

### Requirement: Transactions are normalized and pushed to Actual

During the DRAIN phase, for each profile connected to an item, the system SHALL read that profile's undelivered journal slice (events past its watermark, filtered to the accounts mapped within that profile), filter pending transactions per the profile's `pending_visible` setting, map each Plaid transaction to an Actual transaction, and push the batch via `@actual-app/api.importTransactions` against that profile's target Actual account. The existing pending promotion and removal lifecycle SHALL be applied per profile.

#### Scenario: Fan-out import to two budgets
- **WHEN** an item's pulled transactions are drained to two connected profiles
- **THEN** each profile imports its mapped accounts' transactions into its own budget using its own target accounts and pending setting, and each advances its watermark independently

#### Scenario: Drain applies pending lifecycle per profile
- **WHEN** a profile's slice contains pending promotions or removals
- **THEN** the system applies promotions and removals against that profile's budget exactly as the single-budget lifecycle did

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

The system SHALL run the Actual client lifecycle (`init` → `downloadBudget` → imports → `sync` → `shutdown`) **once per profile per run**, using that profile's connection settings (`server_url`, decrypted server password, `budget_id`, and decrypted encryption password when set) and a per-profile cache directory `data/actual-cache/<profileId>`. Because `@actual-app/api` is a process singleton, per-profile lifecycles SHALL run sequentially. The per-profile cache directory SHALL be wiped after the profile's drain completes.

#### Scenario: Multi-profile drain
- **WHEN** a run drains to multiple profiles
- **THEN** each profile is initialized, downloaded, imported, synced, and shut down in turn, one at a time

#### Scenario: One profile's budget is unreachable
- **WHEN** initializing or downloading a profile's budget fails
- **THEN** that profile's watermark is not advanced, its accounts' results record the failure, the run continues for other profiles, and the failed profile retries from the journal on a later run

#### Scenario: Wrong encryption password
- **WHEN** `downloadBudget` fails because the profile's encryption password is incorrect
- **THEN** the failure is recorded distinctly for that profile, its watermark is not advanced, and other profiles are unaffected

#### Scenario: Cache directory is cleaned up
- **WHEN** a profile's drain finishes (success or failure)
- **THEN** its `data/actual-cache/<profileId>` directory is wiped so a plaintext budget copy does not persist at rest between runs

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

### Requirement: Sync results are presented per connection and persist until dismissed

After a sync, the Connections page SHALL present each connection's outcome on that
connection's own card: an imported-transaction count for connections that synced,
and a skip message with retry hint for connections that were throttled (see
sync-rate-limit). The page SHALL also show an overall imported total below the
sync controls.

These result and skip messages SHALL persist until the user dismisses them via a
per-message close control, with a 60-second automatic clear as a fallback. The
page SHALL NOT auto-reload to display or clear results; instead it SHALL update
each synced connection's displayed last-sync time in place from the sync response.

#### Scenario: Per-connection imported count is shown and stays visible

- **WHEN** a sync completes and a connection imported some transactions
- **THEN** that connection's card shows its imported count, and the message
  remains visible until the user dismisses it or the 60-second fallback elapses

#### Scenario: Result persists without auto-reload

- **WHEN** a sync completes
- **THEN** the page does not auto-reload, the overall imported total is shown below
  the sync controls, and each synced connection's last-sync time is updated in
  place from the response

#### Scenario: User dismisses a message

- **WHEN** the user activates a message's close control
- **THEN** that message is removed while other messages remain

