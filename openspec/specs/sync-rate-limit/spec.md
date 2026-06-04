# sync-rate-limit Specification

## Purpose
TBD - created by archiving change sync-rate-limit. Update Purpose after archive.
## Requirements
### Requirement: Admin configures a per-connection sync ceiling

The system SHALL let an `admin`, on the `/settings` page, configure a per-connection sync ceiling as a maximum number of pulls (`N`) per connection within a rolling window of `X` hours, stored in the `settings` table. Members SHALL be denied access. When either value is unset or not a positive number, the ceiling SHALL be treated as disabled.

#### Scenario: Admin sets the ceiling
- **WHEN** an authenticated `admin` submits a positive max and window on `/settings`
- **THEN** both values are stored and applied to subsequent sync requests

#### Scenario: Member cannot configure it
- **WHEN** a `member` attempts to view or change the ceiling settings
- **THEN** the system responds 403 and does not reveal or modify them

#### Scenario: Disabled when unset
- **WHEN** no ceiling values are configured
- **THEN** sync requests are not throttled by this feature

### Requirement: Connection pulls are counted per connection in a rolling window

The system SHALL count, per connection (Plaid item), the number of sync runs whose `started_at` falls within the last `X` hours and that touched that connection (i.e. included at least one of its accounts in `sync_account_results`). The count SHALL be independent per connection, so syncing connections individually or together yields the same per-connection count. Every qualifying run counts regardless of its terminal status or trigger (manual or scheduled).

#### Scenario: Per-connection counting is batching-independent
- **WHEN** a user syncs connection A and connection B in one run, versus two separate runs
- **THEN** connection A is counted once and connection B is counted once in both cases

#### Scenario: Counting is isolated per connection
- **WHEN** connection A has been pulled `N` times in the window but connection B has not
- **THEN** connection A is over its ceiling while connection B is still under it

#### Scenario: Older runs roll off
- **WHEN** a connection's earlier pulls are older than `X` hours
- **THEN** those pulls no longer count toward that connection's ceiling

### Requirement: Over-limit connections are skipped, others proceed

When the ceiling is enabled, the system SHALL exclude from a sync request any account whose connection is at or above `N` pulls in the window, sync the remaining accounts normally, and report the skipped connections with a hint of when each can be synced again. No Plaid calls SHALL be made for a skipped connection. If every targeted connection is over its limit, no sync run SHALL be created and the response SHALL list all of them as skipped.

#### Scenario: Mixed request skips only the over-limit connection
- **WHEN** a user syncs connections A (over limit) and B (under limit) together
- **THEN** B syncs normally, A is skipped with a retry hint, and no Plaid call is made for A

#### Scenario: UI surfaces skipped connections
- **WHEN** the home page receives a sync result containing skipped connections
- **THEN** it shows a friendly message in the sync-result area naming the skipped connections and when to retry, alongside the results for the connections that synced

#### Scenario: All targeted connections over the limit
- **WHEN** every connection in the request is at or above its ceiling
- **THEN** no sync run is created, no Plaid calls are made, and the response lists all connections as skipped

