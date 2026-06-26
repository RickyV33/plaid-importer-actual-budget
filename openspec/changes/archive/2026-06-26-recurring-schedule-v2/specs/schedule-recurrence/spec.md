## ADDED Requirements

### Requirement: Schedules use day-of-week recurrence cadence

New schedules SHALL store a structured cadence: `days_of_week` (JSON array of 0–6 integers, 0=Sun), `time_of_day` (HH:MM string in 24h), `repeat_weeks` (positive integer, 1=weekly), and `timezone` (IANA timezone string). These fields replace `interval_hours` for all newly created and edited schedules.

#### Scenario: Creating a new schedule
- **WHEN** a user submits the create form with days, time, timezone, repeat_weeks, and connections
- **THEN** a schedule row is persisted with the new cadence fields, `interval_hours=NULL`, and `next_run_at` set to the first future occurrence

#### Scenario: No days selected is rejected
- **WHEN** a user submits the create form with no days of week selected
- **THEN** the server returns a 400 error and no schedule is created

### Requirement: Next occurrence is computed from structured cadence

The system SHALL compute `next_run_at` as the earliest future calendar moment matching the schedule's `days_of_week`, `time_of_day`, `timezone`, and `repeat_weeks` anchor (based on `last_run_at`). A "weekly" schedule (repeat_weeks=1) fires every matching weekday each week. A "bi-weekly" schedule (repeat_weeks=2) fires only on matching weekdays in alternating weeks, anchored to the first run.

#### Scenario: Weekly schedule advances to next matching day
- **WHEN** a weekly schedule on [Mon, Wed, Fri] at 09:00 fires on a Monday
- **THEN** `next_run_at` is set to the following Wednesday at 09:00 in the schedule's timezone

#### Scenario: Bi-weekly schedule skips off weeks
- **WHEN** a bi-weekly schedule fires on Monday of week N
- **THEN** `next_run_at` is set to the next matching weekday in week N+2, not week N+1

#### Scenario: DST transition does not shift the clock time
- **WHEN** `next_run_at` is computed across a DST boundary
- **THEN** the wall-clock time (e.g. 09:00) is preserved in the schedule's timezone, not the UTC offset

### Requirement: Schedules can be edited via a dedicated edit page

The system SHALL provide `GET /schedules/:id/edit` (pre-populated form) and `POST /schedules/:id/edit` (save). Editing a legacy schedule (one with `interval_hours` set) SHALL clear `interval_hours` and persist the new cadence fields. The edit form is the same shared partial used by schedule creation.

#### Scenario: Editing a legacy schedule migrates it to new format
- **WHEN** a user submits the edit form for a legacy schedule
- **THEN** `interval_hours` is set to NULL, the new cadence fields are stored, and `next_run_at` is recomputed

#### Scenario: Editing a new-format schedule updates cadence
- **WHEN** a user submits the edit form for a new-format schedule with changed days or time
- **THEN** the cadence fields are updated and `next_run_at` is recomputed from the new values

#### Scenario: Edit form pre-populates best-effort for legacy schedules
- **WHEN** a user opens the edit form for a legacy schedule
- **THEN** the form shows time-of-day inferred from `next_run_at` (UTC), days defaulting to Mon–Fri, repeat_weeks=1, and timezone auto-detected from the browser

### Requirement: Legacy schedule cards surface a warning and restricted actions

Schedule cards for legacy rows (those with `interval_hours IS NOT NULL`) SHALL display a visible warning that the schedule uses the old format and must be edited or deleted. Legacy cards SHALL NOT show an enable/disable toggle — only Edit and Delete actions.

#### Scenario: Legacy card shows warning
- **WHEN** a user views the schedules page with at least one legacy schedule
- **THEN** each legacy card displays an inline warning message prompting the user to edit or delete it

#### Scenario: Legacy card has no toggle
- **WHEN** a legacy schedule card is rendered
- **THEN** no enable/disable button is present on that card
