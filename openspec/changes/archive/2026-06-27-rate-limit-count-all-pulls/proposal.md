## Why

The per-connection sync limit never trips for a connection that imports nothing.
The billable Plaid pull happens in the sync run's PULL phase for every targeted
connection, but the rate limiter counts a pull only when the run wrote a row to
`sync_account_results` — and those rows are written during the DRAIN phase. A
pull that yields no new transactions (empty delta), or a connection that maps to
no profile, drains nothing and records no result row, so the limiter sees zero
pulls and the connection is never skipped no matter how many times it is synced.

## What Changes

- Guarantee that every successful Plaid pull of a connection records at least one
  `sync_account_results` row for that connection in the run. When a pulled
  connection would otherwise record no per-account result (no new transactions,
  or no mapped profile), the run records a 0-import marker row for one of the
  connection's targeted accounts.
- As a result, `countPullsForItemSince` counts every pull, so the per-connection
  ceiling trips after the configured number of pulls regardless of how many
  transactions each pull imported.

No change to how transactions are pulled, drained, or imported; no change to the
limit configuration or the skip/response behavior. Connections that already
recorded results are unaffected (no duplicate marker).

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `sync-rate-limit`: clarifies that a connection's pull count includes every run
  that pulled the connection from Plaid — including no-op pulls (0 imported) and
  pulls of connections with no mapped profile — by guaranteeing each successful
  pull records a `sync_account_results` row for the connection.

## Impact

- **Sync run** (`src/sync/run.ts`): after drain and failure recording, for each
  successfully pulled target connection that produced no result row this run,
  record a 0-import marker row (representative targeted account, `profile_id`
  NULL) so the pull is counted and visible.
- **Tests** (`src/sync/*` / `src/db/queries.test.ts`): cover that a no-op pull is
  counted by `countPullsForItemSince`.
- No migration, no API contract change, no dependency change.
