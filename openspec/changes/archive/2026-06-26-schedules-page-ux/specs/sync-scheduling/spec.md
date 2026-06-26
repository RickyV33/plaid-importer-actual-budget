## ADDED Requirements

### Requirement: Schedules are managed through a list page with a dedicated creation page

The Schedules UI SHALL present existing schedules as a calm, scannable list and
SHALL offer schedule creation through a dedicated form page reached from a header
button, mirroring the Profiles management pattern. The list page SHALL NOT embed
the creation form inline.

When the owner has at least one connection, the list page header SHALL show a
"New schedule" call-to-action that navigates to a dedicated creation page; that
page SHALL host the cadence/connection form and SHALL submit to the existing
create endpoint. When the owner has no connections, the header SHALL instead show
guidance to link a connection first, in place of the creation call-to-action.

This requirement governs presentation only; storage, fan-out, and scheduler
behavior are defined by the other requirements in this capability and are
unchanged.

#### Scenario: Header offers creation on a separate page

- **WHEN** an authenticated owner with at least one connection views the
  Schedules list page
- **THEN** the page shows a header with a "New schedule" action that navigates to
  a dedicated creation page, and the list page itself contains no inline creation
  form

#### Scenario: Creation page submits to the existing endpoint

- **WHEN** the owner completes and submits the form on the dedicated creation page
- **THEN** the schedule is created via the existing create endpoint and the owner
  is returned to the Schedules list, with the new schedule shown

#### Scenario: No connections suppresses the creation action

- **WHEN** an authenticated owner with zero connections views the Schedules list
  page
- **THEN** the header shows guidance to link a connection first instead of the
  "New schedule" action, and no creation form is shown

### Requirement: Schedule rows convey enabled state visually and toggle via an icon

Each non-legacy schedule row SHALL convey its enabled/disabled state visually
through a status indicator distinguishing an active schedule from a paused one,
rather than relying on inline status text alone. A disabled schedule's row SHALL
be visually de-emphasized relative to an enabled one.

Each non-legacy schedule row SHALL expose enable/disable as an icon control whose
icon reflects the current state, presented consistently with the row's other icon
actions (edit, delete). The control SHALL carry an accessible label describing the
action it performs. Activating the control SHALL toggle the schedule's enabled
state via the existing toggle endpoint. Legacy schedules retain their existing
update affordance and are out of scope for the toggle control.

#### Scenario: Active schedule shows active styling and a disable toggle

- **WHEN** an enabled non-legacy schedule is rendered in the list
- **THEN** the row shows an active status indicator (not merely inline text) and
  an icon toggle, with an accessible label, that disables the schedule when
  activated

#### Scenario: Paused schedule shows de-emphasized styling and an enable toggle

- **WHEN** a disabled non-legacy schedule is rendered in the list
- **THEN** the row is visually de-emphasized and shows a paused status indicator
  and an icon toggle, with an accessible label, that enables the schedule when
  activated

#### Scenario: Toggling uses the existing endpoint

- **WHEN** the owner activates a schedule's enable/disable icon control
- **THEN** the schedule's enabled state is flipped through the existing toggle
  endpoint and the updated state is reflected in the list
