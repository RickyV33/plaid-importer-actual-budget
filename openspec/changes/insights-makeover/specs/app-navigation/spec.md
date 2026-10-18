## MODIFIED Requirements

### Requirement: Primary surfaces are flat top-level navigation siblings

Each primary authenticated surface SHALL be a distinct page reached directly from
a single top-level navigation control. The primary surfaces are Overview (the
landing dashboard), Connections, Profiles, Schedules, History, and (for admins)
Settings. The navigation SHALL be a tab strip in which the current surface is
marked and exposed with `aria-current="page"`. The navigation SHALL NOT nest any
primary surface behind a second, in-page switcher; in particular, Connections and
Profiles SHALL each have their own page and URL rather than being tabs within
another page. Sign-out SHALL be a header tool rather than a navigation entry.

#### Scenario: Connections and Profiles are top-level nav entries

- **WHEN** an authenticated user views any page's top navigation
- **THEN** Overview, Connections, Profiles, Schedules, and History each appear as
  their own tab (and Settings for admins), and selecting one navigates directly to
  that page's URL

#### Scenario: Current surface is marked

- **WHEN** an authenticated user is on the Profiles page
- **THEN** the Profiles tab is marked current with `aria-current="page"` and no
  other tab is

#### Scenario: No in-page tab switcher for primary surfaces

- **WHEN** an authenticated user opens the Connections page or the Profiles page
- **THEN** the page shows only that surface, with no in-page tab control for
  switching between Connections and Profiles

### Requirement: The landing route is a read-only status dashboard

The application's landing route (`/`) SHALL render a read-only overview that
summarizes the authenticated user's current state and links into the primary
pages. The overview SHALL NOT expose create, edit, or delete actions, and SHALL
NOT perform Plaid or Actual Budget network calls; it derives its summary solely
from locally stored state (see sync-insights).

The overview SHALL present, at minimum:

- a **hero figure**: transactions imported in the last 30 days, with the 7-, 60-,
  and 90-day totals alongside it, each window derived by summing recorded
  per-run import counts within that window (see sync-history), and the soonest
  next scheduled sync across the user's connections with a link to Schedules;
- **metric cards**: the number of linked connections (with a distinct alert when
  one or more connections require relinking), the number of profiles, mapping
  coverage across the user's profiles (see sync-insights), and the run success
  rate over the last 30 days;
- an **imports-per-day** column chart for the last 30 days and an **imports by
  connection** bar list for the same window;
- a **per-connection sync status** list showing, for each connection, its
  freshness, its own last sync time, and its next scheduled sync time.

A connection's next scheduled sync SHALL be the soonest upcoming run among the
user's enabled schedules that target that connection; a connection targeted by
no enabled schedule SHALL show a calm "no schedule" state rather than a value.

The connections, profiles, coverage, and imported figures SHALL link to their
corresponding page (Connections, Profiles, Profiles, History). Each summary SHALL
degrade to a calm empty state when the underlying data is absent.

#### Scenario: Dashboard summarizes local state with links

- **WHEN** an authenticated user with connections, profiles, prior syncs, and an
  enabled schedule opens `/`
- **THEN** the overview shows the 30-day imported hero with 7/60/90-day totals,
  the next scheduled sync, the connection, profile, coverage, and success-rate
  cards, the imports-per-day chart, the imports-by-connection list, and each
  connection's freshness, last, and next sync — with the figures linking to their
  pages — without performing any Plaid or Actual Budget calls

#### Scenario: Per-connection last and next sync

- **WHEN** an authenticated user has two connections, each synced at different
  times and targeted by different enabled schedules, and opens `/`
- **THEN** the overview shows each connection's own last sync time and its own
  next scheduled sync time, rather than a single combined value for all
  connections

#### Scenario: Connection with no enabling schedule

- **WHEN** a connection is targeted by no enabled schedule
- **THEN** that connection's next sync shows a calm "no schedule" state instead of
  a time

#### Scenario: Windowed imported totals

- **WHEN** an authenticated user has prior sync runs and opens `/`
- **THEN** the overview shows the total transactions imported over the last 30
  days as the hero figure and the 7, 60, and 90-day totals beside it

#### Scenario: Relink alert is surfaced

- **WHEN** an authenticated user has at least one connection whose status requires
  relinking and opens `/`
- **THEN** the overview shows a distinct relink-needed alert that links to the
  Connections page

#### Scenario: Empty states for a fresh account

- **WHEN** an authenticated user with no connections, no profiles, no prior syncs,
  and no schedules opens `/`
- **THEN** each summary shows a calm empty state instead of a value (the hero
  shows zero with a short explanation, the charts show a muted sentence), and the
  overview exposes no create/edit/delete controls

#### Scenario: Dashboard is read-only

- **WHEN** the overview is rendered
- **THEN** it contains no controls that create, edit, or delete connections,
  profiles, schedules, or mappings; such actions remain on their respective pages
