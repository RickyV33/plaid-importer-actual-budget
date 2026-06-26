# app-navigation Specification

## Purpose
Defines the application shell's navigation model: a single flat top navigation of
sibling pages (Connections, Profiles, Schedules, History, and — for admins —
Settings), a read-only status dashboard at the landing route `/`, and dedicated
Connections and Profiles pages in place of nested in-page tabs.
## Requirements
### Requirement: Primary surfaces are flat top-level navigation siblings

Each primary authenticated surface SHALL be a distinct page reached directly from
a single top-level navigation control. The primary surfaces are Connections,
Profiles, Schedules, History, and (for admins) Settings. The navigation SHALL
NOT nest any primary surface behind a second, in-page switcher; in particular,
Connections and Profiles SHALL each have their own page and URL rather than being
tabs within another page.

#### Scenario: Connections and Profiles are top-level nav entries

- **WHEN** an authenticated user views any page's top navigation
- **THEN** Connections and Profiles each appear as their own navigation entry
  alongside Schedules and History (and Settings for admins), and selecting one
  navigates directly to that page's URL

#### Scenario: No in-page tab switcher for primary surfaces

- **WHEN** an authenticated user opens the Connections page or the Profiles page
- **THEN** the page shows only that surface, with no in-page tab control for
  switching between Connections and Profiles

### Requirement: Dedicated Connections and Profiles pages load only their own data

The Connections page and the Profiles page SHALL each render independently at
their own route and SHALL load only the data needed for that page. Rendering the
Connections page SHALL NOT perform the external Actual Budget account lookups that
only the Profiles mapping view requires.

#### Scenario: Connections page renders connection management

- **WHEN** an authenticated user navigates to the Connections page
- **THEN** the page lists the user's linked connections and their accounts with
  the link, sync, relink, manage-accounts, and removal actions, and does not
  perform per-profile Actual Budget account lookups

#### Scenario: Profiles page renders profile management

- **WHEN** an authenticated user navigates to the Profiles page
- **THEN** the page lists the user's profiles with their account mappings and the
  create, edit, delete, mapping, and pending-visibility actions

### Requirement: The landing route is a read-only status dashboard

The application's landing route (`/`) SHALL render a read-only dashboard that
summarizes the authenticated user's current state and links into the primary
pages. The dashboard SHALL NOT expose create, edit, or delete actions, and SHALL
NOT perform Plaid or Actual Budget network calls; it derives its summary solely
from locally stored state.

The dashboard SHALL present, at minimum: the number of linked connections (with a
distinct alert when one or more connections require relinking), the number of
profiles, the most recent successful sync time, and the next scheduled sync time.
Each summary SHALL link to its corresponding page (Connections, Profiles, History,
Schedules). Each summary SHALL degrade to a calm empty state when the underlying
data is absent.

#### Scenario: Dashboard summarizes local state with links

- **WHEN** an authenticated user with connections, profiles, prior syncs, and an
  enabled schedule opens `/`
- **THEN** the dashboard shows the connection count, profile count, most-recent
  sync time, and next scheduled sync time, each linking to its corresponding page,
  without performing any Plaid or Actual Budget calls

#### Scenario: Relink alert is surfaced

- **WHEN** an authenticated user has at least one connection whose status requires
  relinking and opens `/`
- **THEN** the dashboard shows a distinct relink-needed alert that links to the
  Connections page

#### Scenario: Empty states for a fresh account

- **WHEN** an authenticated user with no connections, no profiles, no prior syncs,
  and no schedules opens `/`
- **THEN** each summary shows a calm empty state instead of a value, and the
  dashboard exposes no create/edit/delete controls

#### Scenario: Dashboard is read-only

- **WHEN** the dashboard is rendered
- **THEN** it contains no controls that create, edit, or delete connections,
  profiles, schedules, or mappings; such actions remain on their respective pages

### Requirement: The dashboard shows the other-user count to admins only

For an admin user, the dashboard SHALL additionally present the number of other
registered users on the platform (the total registered user count excluding the
viewing admin). This summary SHALL NOT be shown to non-admin users. As with the
other summaries, it is derived from locally stored state and performs no external
network calls.

#### Scenario: Admin sees the other-user count

- **WHEN** an admin user opens `/` and the platform has more than one registered
  user
- **THEN** the dashboard shows the number of other registered users (the total
  count minus the viewing admin)

#### Scenario: Sole admin sees a calm empty state

- **WHEN** an admin user opens `/` and is the only registered user
- **THEN** the other-user summary shows a calm empty state (e.g. no other users)
  rather than a misleading count

#### Scenario: Non-admins never see the other-user count

- **WHEN** a non-admin user opens `/`
- **THEN** the dashboard does not show any other-user count

