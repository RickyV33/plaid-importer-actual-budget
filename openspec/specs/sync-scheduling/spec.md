# sync-scheduling Specification

## Purpose
Defines how sync schedules are stored, created, edited, and fired by the in-process scheduler.

## Requirements

### Requirement: Schedules target a set of connections

The system SHALL store schedules in a `schedules` table owned by a user, each referencing the set of `plaid_item_ids` (connections) to sync, a cadence, and an `enabled` flag. Connections billing in Plaid is per item, so scheduling is by connection rather than by account. The connections SHALL be owned by the schedule's owner.

New schedules use the structured cadence (`days_of_week`, `time_of_day`, `repeat_weeks`, `timezone`). Legacy schedules that predate this change retain a non-null `interval_hours` value and are identified as legacy by `days_of_week IS NULL`. Both row formats are valid and coexist in the table. `interval_hours` is a candidate for removal in a future migration once all legacy rows have been migrated.

#### Scenario: Creating a schedule
- **WHEN** an authenticated user creates a schedule selecting one or more of their connections and a cadence
- **THEN** a `schedules` row is persisted with `enabled=true`, `interval_hours=NULL`, the new cadence fields set, and a computed `next_run_at`

#### Scenario: Owner scoping
- **WHEN** a user references a connection or schedule owned by another user
- **THEN** the referenced connection is dropped (or the schedule is 404), and nothing of another user's is changed

### Requirement: Scheduled runs reuse stored mapping settings and fan out

When a schedule fires, the system SHALL expand its connections to their accounts and invoke the sync orchestrator with `triggered_by="scheduled"`, using the per-(profile, account) settings already stored in `profile_account_mappings` (including `pending_visible`). Each connection is pulled once and fans out to every profile that maps its accounts. A schedule SHALL NOT carry its own copy of those settings.

#### Scenario: Pending setting honored from the mapping
- **WHEN** a scheduled run delivers an account whose profile mapping has `pending_visible=1`
- **THEN** that profile imports pending transactions for the account, matching a manual run with the same mapping

#### Scenario: Connection fans out to all mapping profiles
- **WHEN** a scheduled connection's account is mapped in more than one profile
- **THEN** the single pull updates every profile that maps it

#### Scenario: Run recorded as scheduled
- **WHEN** a schedule fires a sync
- **THEN** the resulting `sync_runs` row has `triggered_by="scheduled"`

### Requirement: In-process scheduler fires due schedules without overlapping runs

The system SHALL run an in-process scheduler that periodically evaluates enabled schedules and triggers those whose `next_run_at` has passed, then recomputes `next_run_at` and records `last_run_at`. A schedule SHALL NOT start a run while another sync is in progress; it SHALL be retried on a subsequent tick. Schedule timers SHALL be recoverable across restarts from persisted `next_run_at`.

After a run, `next_run_at` is advanced using the schedule's cadence type:
- **Legacy** (`interval_hours IS NOT NULL`): `next_run_at = last_run_at + interval_hours * 3600_000`
- **New format** (`days_of_week IS NOT NULL`): `next_run_at = nextOccurrence(days_of_week, time_of_day, repeat_weeks, timezone, last_run_at)`

#### Scenario: Due new-format schedule fires and advances correctly
- **WHEN** an enabled new-format schedule's `next_run_at` is in the past and no sync is running
- **THEN** the scheduler triggers a sync, updates `last_run_at`, and sets `next_run_at` to the next matching day/time occurrence

#### Scenario: Due legacy schedule fires and advances correctly
- **WHEN** an enabled legacy schedule's `next_run_at` is in the past and no sync is running
- **THEN** the scheduler triggers a sync and advances `next_run_at` by `interval_hours` hours

#### Scenario: Skips while a sync is in progress
- **WHEN** a schedule becomes due while another sync (manual or scheduled) is running
- **THEN** the scheduler does not start an overlapping run and re-evaluates the schedule on the next tick

#### Scenario: Disabled schedule does not fire
- **WHEN** a schedule has `enabled=false`
- **THEN** the scheduler never triggers it

#### Scenario: Recovery after restart
- **WHEN** the process restarts and a schedule was due during downtime
- **THEN** the scheduler recomputes due schedules from persisted `next_run_at` and fires it shortly after boot

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

