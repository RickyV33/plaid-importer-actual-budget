## MODIFIED Requirements

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
