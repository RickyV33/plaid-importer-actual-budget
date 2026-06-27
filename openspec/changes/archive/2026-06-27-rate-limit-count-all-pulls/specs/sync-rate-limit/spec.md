## MODIFIED Requirements

### Requirement: Connection pulls are counted per connection in a rolling window

The system SHALL count, per connection (Plaid item), the number of sync runs
whose `started_at` falls within the last `X` hours and that pulled that
connection from Plaid. Every successful pull of a connection SHALL record at
least one `sync_account_results` row for that connection in the run, so the
count includes pulls that imported no transactions and pulls of connections that
map to no profile. The count SHALL be independent per connection, so syncing
connections individually or together yields the same per-connection count. Every
qualifying run counts regardless of its terminal status or trigger (manual or
scheduled).

#### Scenario: No-op pull still counts

- **WHEN** a connection is synced and the pull imports zero transactions (empty
  delta, or the connection maps to no profile)
- **THEN** that run still counts as one pull toward the connection's ceiling

#### Scenario: Per-connection counting is batching-independent
- **WHEN** a user syncs connection A and connection B in one run, versus two separate runs
- **THEN** connection A is counted once and connection B is counted once in both cases

#### Scenario: Counting is isolated per connection
- **WHEN** connection A has been pulled `N` times in the window but connection B has not
- **THEN** connection A is over its ceiling while connection B is still under it

#### Scenario: Older runs roll off
- **WHEN** a connection's earlier pulls are older than `X` hours
- **THEN** those pulls no longer count toward that connection's ceiling
