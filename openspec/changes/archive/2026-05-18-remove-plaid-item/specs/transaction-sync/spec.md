## ADDED Requirements

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
