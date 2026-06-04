## MODIFIED Requirements

### Requirement: History view shows recent runs

The system SHALL provide an authenticated `GET /history` route that renders a page listing the most recent sync runs in reverse chronological order, showing for each run: timestamp, **trigger rendered as a visible badge distinguishing `manual` from `scheduled`**, scope, overall status, total transactions imported, and a drill-down to per-account results.

#### Scenario: Browsing history
- **WHEN** an authenticated user visits `/history`
- **THEN** the page lists the most recent sync runs (paginated if necessary), each with a summary row and an expandable per-account detail

#### Scenario: Scheduled vs manual is visible
- **WHEN** the history list contains both manual and scheduled runs
- **THEN** each run shows a badge indicating whether it was `manual` or `scheduled`

#### Scenario: Drill-down to a single run
- **WHEN** an authenticated user expands or navigates to a specific run
- **THEN** the page shows every `sync_account_results` row for that run with the Plaid account name, status, transactions imported, and reason (if any)
