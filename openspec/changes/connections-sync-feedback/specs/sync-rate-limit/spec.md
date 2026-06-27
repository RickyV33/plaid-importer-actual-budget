## MODIFIED Requirements

### Requirement: Over-limit connections are skipped, others proceed

When the ceiling is enabled, the system SHALL exclude from a sync request any
account whose connection is at or above `N` pulls in the window, sync the
remaining accounts normally, and report the skipped connections with their
identifier and a hint of when each can be synced again. No Plaid calls SHALL be
made for a skipped connection. If every targeted connection is over its limit, no
sync run SHALL be created and the response SHALL list all of them as skipped.

The UI SHALL surface a skipped connection's message on that connection, and the
message SHALL persist until the user dismisses it (with a time-based automatic
clear as a fallback) rather than being cleared by a page reload.

#### Scenario: Mixed request skips only the over-limit connection

- **WHEN** a user syncs connections A (over limit) and B (under limit) together
- **THEN** B syncs normally, A is skipped with a retry hint and its identifier,
  and no Plaid call is made for A

#### Scenario: UI surfaces skipped connections persistently

- **WHEN** the Connections page receives a sync result containing skipped
  connections
- **THEN** it shows each skipped connection's retry message on that connection,
  alongside the results for the connections that synced, and the message persists
  until dismissed (with a time-based fallback) instead of disappearing on reload

#### Scenario: All targeted connections over the limit

- **WHEN** every connection in the request is at or above its ceiling
- **THEN** no sync run is created, no Plaid calls are made, and the response lists
  all connections as skipped
