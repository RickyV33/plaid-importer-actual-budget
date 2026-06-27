## MODIFIED Requirements

### Requirement: History view shows recent runs

The system SHALL provide an authenticated `GET /history` route that renders a page
listing the most recent sync runs in reverse chronological order, showing for each
run: timestamp, **trigger rendered as a visible badge distinguishing `manual` from
`scheduled`**, scope, overall status, and total transactions imported. A run that
imported at least one transaction, or whose status is `failure`, SHALL expose a
drill-down to its per-account results, toggled from the run's own row. A
successful run that imported no transactions SHALL render as a plain,
non-expandable row.

#### Scenario: Browsing history
- **WHEN** an authenticated user visits `/history`
- **THEN** the page lists the most recent sync runs (paginated if necessary), each
  with a summary row, and runs that imported at least one transaction or that
  failed are expandable from that row

#### Scenario: Scheduled vs manual is visible
- **WHEN** the history list contains both manual and scheduled runs
- **THEN** each run shows a badge indicating whether it was `manual` or `scheduled`

#### Scenario: Drill-down to a single run
- **WHEN** an authenticated user expands a run that imported at least one
  transaction or that failed
- **THEN** the row reveals every `sync_account_results` row for that run with the
  Plaid account name, status, transactions imported, and reason (if any)

#### Scenario: Failed run is expandable for its reasons
- **WHEN** a run's status is `failure` (even with zero transactions imported)
- **THEN** its row is expandable and reveals the per-account failure reasons

#### Scenario: Successful no-op run is not expandable
- **WHEN** a successful run imported zero transactions (e.g. a no-op pull)
- **THEN** its row renders without an expand control and shows no per-account
  drill-down
