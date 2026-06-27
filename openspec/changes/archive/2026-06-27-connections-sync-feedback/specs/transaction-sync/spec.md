## MODIFIED Requirements

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

## ADDED Requirements

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
