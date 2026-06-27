## ADDED Requirements

### Requirement: Schedules have an optional custom name

The system SHALL allow a schedule to carry an optional, owner-supplied name,
stored as a nullable field on the `schedules` table. The create and edit flows
SHALL accept a name; an absent or blank name SHALL be stored as no name (NULL),
and a name SHALL NOT be required to create or edit a schedule. Names SHALL NOT be
required to be unique.

When a schedule has a name, the UI SHALL display that name as the schedule's
title. When a schedule has no name, the UI SHALL fall back to the schedule's
joined connection names as the title, preserving the prior behavior for
schedules created before this capability existed.

#### Scenario: Create a schedule with a name

- **WHEN** an authenticated owner creates a schedule and supplies a name
- **THEN** the schedule is persisted with that name and the list shows the name
  as the schedule's title

#### Scenario: Create a schedule without a name

- **WHEN** an authenticated owner creates a schedule and leaves the name blank
- **THEN** the schedule is persisted with no name and the list shows the joined
  connection names as the title

#### Scenario: Rename an existing schedule

- **WHEN** an owner edits a schedule and changes or clears its name
- **THEN** the stored name is updated (or cleared to no name) and the list title
  reflects the change, with a cleared name falling back to the connection names

### Requirement: Schedule rows present name, recurrence, and connections on separate lines

A non-legacy schedule row SHALL present its information on distinct lines for
legibility: the schedule's title (name or connection-name fallback) together with
its status indicator on one line, its recurrence (days of week, time, and repeat
cadence) on another, and its targeted connections together with its next-run time
on another. The schedule's time of day SHALL be displayed in 12-hour form with an
AM/PM (locale-appropriate) indicator, while the stored value and the edit form's
time input remain in 24-hour form. Legacy schedules retain their existing
single-line rendering and are out of scope for this layout.

#### Scenario: Non-legacy row is split into legible lines

- **WHEN** a non-legacy schedule is rendered in the list
- **THEN** its title and status appear together, its recurrence appears
  separately, and its connections and next-run time appear separately, rather
  than on a single combined line

#### Scenario: Time is shown in 12-hour form

- **WHEN** a non-legacy schedule with `time_of_day` "13:30" is rendered
- **THEN** the read view shows the time as "1:30 PM" (locale-appropriate) while
  the edit form still presents and submits the value in 24-hour form

#### Scenario: Legacy row layout is unchanged

- **WHEN** a legacy schedule (`days_of_week IS NULL`) is rendered
- **THEN** it keeps its existing single-line interval rendering and warning
