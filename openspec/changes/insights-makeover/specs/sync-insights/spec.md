## ADDED Requirements

### Requirement: Insights are read-only, local, and owner-scoped

Every figure in this capability SHALL be derived only from locally stored state
for the viewing user's own connections, runs, profiles, and schedules. Computing
them SHALL NOT call Plaid or Actual Budget and SHALL NOT change any stored state.

#### Scenario: No external calls
- **WHEN** the overview, connections, schedules, or history page computes insights
- **THEN** no Plaid or Actual Budget request is made for those figures

#### Scenario: Owner scoping
- **WHEN** two users both have sync runs
- **THEN** each user's insights include only their own runs and connections

### Requirement: Daily import series in the viewer's time zone

The system SHALL produce, for a window of N days ending today, one entry per
calendar day containing the sum of `total_imported` over the viewer's runs that
started on that day. Days with no runs SHALL be present with a value of zero.
Days SHALL be calendar days in the viewer's time zone, taken from a `tz` cookie
holding an IANA zone name; a missing or invalid zone SHALL fall back to UTC.

#### Scenario: Gaps are zero-filled
- **WHEN** a user imported 5 transactions three days ago and nothing else in the
  last 7 days
- **THEN** the 7-day series has seven entries, one of them 5 and the rest 0

#### Scenario: Time-zone bucketing
- **WHEN** a run started at 02:00 UTC and the viewer's zone is `America/Chicago`
- **THEN** the run counts toward the previous calendar day

#### Scenario: Invalid zone
- **WHEN** the `tz` cookie holds a value that is not a valid IANA zone
- **THEN** days are bucketed in UTC

### Requirement: Imports by connection and by account

The system SHALL compute, over a window, the number of transactions imported per
connection (summing the per-account results of that connection's accounts) and
per Plaid account, along with each connection's share of the window's total.
Connections with no imports in the window SHALL still be listable with zero.

#### Scenario: Two connections
- **WHEN** connection A imported 30 and connection B imported 10 in the last 30
  days
- **THEN** A shows 30 (75%) and B shows 10 (25%)

### Requirement: Run outcome summary

The system SHALL compute, over a window, the number of finished runs, how many
succeeded and failed, the success rate (succeeded / finished), and the total
imported. Runs still running SHALL be excluded from the rate. With no finished
runs the success rate SHALL be absent rather than 0% or 100%.

#### Scenario: Mixed outcomes
- **WHEN** a user has 9 successful and 1 failed finished run in 30 days
- **THEN** the summary shows 10 runs, 1 failure, and a 90% success rate

#### Scenario: No runs
- **WHEN** a user has no finished runs in the window
- **THEN** the success rate is shown as an empty state

### Requirement: Connection freshness

For each connection the system SHALL classify how recently it synced: `fresh`
(within 24 hours), `stale` (within 7 days), `old` (more than 7 days), or `never`.
A connection that requires relinking SHALL be classified `relink` regardless of
its last sync. Each class SHALL be shown as a text chip, never by color alone.

#### Scenario: Stale connection
- **WHEN** a connection last synced 3 days ago and is active
- **THEN** it is classified `stale` and shows the stale chip text

#### Scenario: Relink wins
- **WHEN** a connection requires relinking and synced an hour ago
- **THEN** it is classified `relink`

### Requirement: Per-connection rate-limit usage

When an admin has configured a sync ceiling, the Connections page SHALL show,
for each connection, how many pulls it has used of the ceiling in the current
rolling window and, when the ceiling is reached, when the next slot frees. When
no ceiling is configured, no usage meter SHALL be shown.

#### Scenario: Partially used
- **WHEN** the ceiling is 4 per 24 hours and a connection pulled twice in that
  window
- **THEN** its panel shows a meter at 2 of 4 with the figures written beside it

#### Scenario: At the ceiling
- **WHEN** a connection has used all 4 pulls
- **THEN** its meter is full and the text says when the next pull is available

#### Scenario: No ceiling
- **WHEN** no sync ceiling is configured
- **THEN** no usage meter is shown on any connection

### Requirement: Mapping coverage

The system SHALL compute, per profile and across all of a user's profiles, how
many syncable (not deselected) Plaid accounts are mapped to an Actual account,
out of the syncable accounts on connections that profile uses. The overview
SHALL show the user-wide figure and each profile panel SHALL show its own, both
as a meter with "N of M accounts routed" text.

#### Scenario: Partial coverage
- **WHEN** a profile maps 3 of the 4 syncable accounts on its connections
- **THEN** its panel shows "3 of 4 accounts routed" with a 75% meter

#### Scenario: Deselected accounts don't count
- **WHEN** a connection has one deselected account
- **THEN** that account counts in neither N nor M

### Requirement: The next seven days of scheduled runs

The Schedules page SHALL show a strip of the next seven calendar days in the
viewer's time zone, starting today, listing under each day every run an enabled,
non-legacy schedule will make that day, with its local time and schedule name.
Runs SHALL be computed with the same recurrence rule the scheduler uses. Days
with no runs SHALL render as calm empty days.

#### Scenario: Weekday schedule
- **WHEN** a user has one enabled schedule for Mon/Wed/Fri at 07:00 and views the
  page on a Monday
- **THEN** the strip lists runs at 07:00 under Monday, Wednesday, and Friday, and
  the other days are empty

#### Scenario: Paused schedule excluded
- **WHEN** a schedule is disabled
- **THEN** none of its runs appear in the strip
