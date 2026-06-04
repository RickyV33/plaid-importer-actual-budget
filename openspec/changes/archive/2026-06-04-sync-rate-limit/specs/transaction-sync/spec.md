## MODIFIED Requirements

### Requirement: Trigger a sync run with explicit account selection

The system SHALL provide an authenticated `POST /sync` endpoint that accepts a body identifying which Plaid accounts to sync — either `{ "scope": "all" }` to sync every linked account, or `{ "scope": "selected", "plaidAccountIds": [...] }` for a specific subset. When the per-connection sync ceiling is enabled (see sync-rate-limit), the endpoint SHALL exclude accounts whose connection is at or above its limit before starting the run, sync the remaining accounts, and report the skipped connections in the response.

#### Scenario: Sync all accounts
- **WHEN** an authenticated user POSTs `/sync` with `scope=all`
- **THEN** the system queues a sync run including every linked account whose connection is under its ceiling

#### Scenario: Sync selected accounts
- **WHEN** an authenticated user POSTs `/sync` with `scope=selected` and a non-empty `plaidAccountIds` array
- **THEN** the system queues a sync run including only those accounts whose connection is under its ceiling

#### Scenario: Sync with empty selection
- **WHEN** an authenticated user POSTs `/sync` with `scope=selected` and an empty array
- **THEN** the endpoint responds with 400 and no sync run is created

#### Scenario: Some connections over the ceiling
- **WHEN** a sync request includes accounts from a connection at or above its per-connection ceiling
- **THEN** those accounts are excluded from the run, the remaining accounts sync normally, and the response reports the skipped connections with a retry hint
