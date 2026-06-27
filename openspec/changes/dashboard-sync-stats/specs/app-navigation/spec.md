## MODIFIED Requirements

### Requirement: The landing route is a read-only status dashboard

The application's landing route (`/`) SHALL render a read-only dashboard that
summarizes the authenticated user's current state and links into the primary
pages. The dashboard SHALL NOT expose create, edit, or delete actions, and SHALL
NOT perform Plaid or Actual Budget network calls; it derives its summary solely
from locally stored state.

The dashboard SHALL present, at minimum: the number of linked connections (with a
distinct alert when one or more connections require relinking), the number of
profiles, a per-connection sync-timing summary, and an imported-transactions
summary over rolling time windows.

The per-connection sync-timing summary SHALL show, for each of the user's
connections, that connection's own last sync time and its next scheduled sync
time. A connection's next scheduled sync SHALL be the soonest upcoming run among
the user's enabled schedules that target that connection; a connection targeted
by no enabled schedule SHALL show a calm "no schedule" state rather than a value.

The imported-transactions summary SHALL show the total number of transactions
imported by the user over the last 7, 30, 60, and 90 days, each window derived by
summing recorded per-run import counts within that window (see sync-history).

The single-figure card summaries (connections, profiles, imported totals) SHALL
link to their corresponding page (Connections, Profiles, History). The
per-connection sync-timing summary is informational and need not itself be a
link, since the primary navigation already links to History and Schedules. Each
summary SHALL degrade to a calm empty state when the underlying data is absent.

#### Scenario: Dashboard summarizes local state with links

- **WHEN** an authenticated user with connections, profiles, prior syncs, and an
  enabled schedule opens `/`
- **THEN** the dashboard shows the connection count, profile count, each
  connection's last and next sync time, and the windowed imported-transaction
  totals — with the card summaries linking to their corresponding page — without
  performing any Plaid or Actual Budget calls

#### Scenario: Per-connection last and next sync

- **WHEN** an authenticated user has two connections, each synced at different
  times and targeted by different enabled schedules, and opens `/`
- **THEN** the dashboard shows each connection's own last sync time and its own
  next scheduled sync time, rather than a single combined value for all
  connections

#### Scenario: Connection with no enabling schedule

- **WHEN** a connection is targeted by no enabled schedule
- **THEN** that connection's next sync shows a calm "no schedule" state instead of
  a time

#### Scenario: Windowed imported totals

- **WHEN** an authenticated user has prior sync runs and opens `/`
- **THEN** the dashboard shows the total transactions imported over the last 7,
  30, 60, and 90 days

#### Scenario: Relink alert is surfaced

- **WHEN** an authenticated user has at least one connection whose status requires
  relinking and opens `/`
- **THEN** the dashboard shows a distinct relink-needed alert that links to the
  Connections page

#### Scenario: Empty states for a fresh account

- **WHEN** an authenticated user with no connections, no profiles, no prior syncs,
  and no schedules opens `/`
- **THEN** each summary shows a calm empty state instead of a value (including a
  zero or empty imported-totals summary), and the dashboard exposes no
  create/edit/delete controls

#### Scenario: Dashboard is read-only

- **WHEN** the dashboard is rendered
- **THEN** it contains no controls that create, edit, or delete connections,
  profiles, schedules, or mappings; such actions remain on their respective pages
