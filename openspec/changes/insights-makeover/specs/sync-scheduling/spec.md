## MODIFIED Requirements

### Requirement: Schedules are managed through a list page with a dedicated creation page

The Schedules UI SHALL present existing schedules as a calm, scannable list and
SHALL offer schedule creation through a dedicated form page reached from a header
button, mirroring the Profiles management pattern. The list page SHALL NOT embed
the creation form inline.

When the owner has at least one connection, the list page header SHALL show a
"New schedule" call-to-action that navigates to a dedicated creation page
(`/schedules/new`); that page SHALL host the cadence/connection form and SHALL
submit to the schedule create endpoint (`POST /api/schedules`). When the owner
has no connections, the header SHALL instead show guidance to link a connection
first, in place of the creation call-to-action.

This requirement governs presentation only; storage, fan-out, and scheduler
behavior are defined by the other requirements in this capability and are
unchanged.

#### Scenario: Header offers creation on a separate page

- **WHEN** an authenticated owner with at least one connection views the
  Schedules list page
- **THEN** the page shows a header with a "New schedule" action that navigates to
  a dedicated creation page, and the list page itself contains no inline creation
  form

#### Scenario: Creation page submits to the create endpoint

- **WHEN** the owner completes and submits the form on the dedicated creation page
- **THEN** the schedule is created via the create endpoint and the owner is
  returned to the Schedules list, with the new schedule shown

#### Scenario: No connections suppresses the creation action

- **WHEN** an authenticated owner with zero connections views the Schedules list
  page
- **THEN** the header shows guidance to link a connection first instead of the
  "New schedule" action, and no creation form is shown
