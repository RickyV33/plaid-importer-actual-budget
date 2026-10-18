## MODIFIED Requirements

### Requirement: History view shows recent runs

The system SHALL provide an authenticated `GET /history` route that renders a page
opening with a summary of the viewer's last 30 days (finished runs, success rate,
transactions imported, failures; see sync-insights) and a column chart of
transactions imported per day over the last 90 days, followed by the most recent
sync runs in reverse chronological order. Each run SHALL be a row showing:
timestamp, **trigger rendered as a visible chip distinguishing `manual` from
`scheduled`**, scope, overall status as text, and total transactions imported. A
run that imported at least one transaction, or whose status is `failure`, SHALL
expose a drill-down to its per-account results, toggled from the run's own row by
mouse or keyboard and announcing its expanded state. A successful run that
imported no transactions SHALL render as a plain, non-expandable row. The summary
and chart SHALL cover the viewer's runs regardless of which page of the run list
is shown.

#### Scenario: Browsing history
- **WHEN** an authenticated user visits `/history`
- **THEN** the page shows the 30-day summary and 90-day chart, then lists the most
  recent sync runs (paginated if necessary), each with a summary row, and runs
  that imported at least one transaction or that failed are expandable from that
  row

#### Scenario: Scheduled vs manual is visible
- **WHEN** the history list contains both manual and scheduled runs
- **THEN** each run shows a chip indicating whether it was `manual` or `scheduled`

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

#### Scenario: Summary is independent of paging
- **WHEN** an authenticated user opens an older page of the history list
- **THEN** the 30-day summary and 90-day chart show the same figures as on the
  first page

### Requirement: User can acknowledge an orphan

The system SHALL provide an authenticated `POST /api/history/orphans/:id/ack` endpoint that sets `acknowledged_at` to now for the given row if it exists, belongs to one of the user's accounts, and is currently unacknowledged. The endpoint SHALL respond with the user's remaining unacknowledged orphans, so the page can update the list in place (and drop it entirely when none remain).

#### Scenario: Ack an unacknowledged orphan
- **WHEN** an authenticated user POSTs the ack endpoint for an existing unacknowledged orphan id
- **THEN** the row's `acknowledged_at` is set to now, and the response's orphan list no longer contains it

#### Scenario: Ack the last unacknowledged orphan
- **WHEN** the user acks the last remaining unacknowledged orphan
- **THEN** the response's orphan list is empty and the page no longer shows the orphan list

#### Scenario: Ack an unknown or already-acknowledged orphan
- **WHEN** the user POSTs the ack endpoint for an id that does not exist, belongs to someone else, or whose `acknowledged_at` is already set
- **THEN** the endpoint responds with 404 and MUST NOT alter the existing `acknowledged_at` timestamp
