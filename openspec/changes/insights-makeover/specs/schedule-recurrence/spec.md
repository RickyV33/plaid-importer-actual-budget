## MODIFIED Requirements

### Requirement: Schedules can be edited via a dedicated edit page

The system SHALL provide a dedicated edit page at `/schedules/:id/edit`, pre-populated from `GET /api/schedules/:id`, that saves through `PUT /api/schedules/:id`. Editing a legacy schedule (one with `interval_hours` set) SHALL clear `interval_hours` and persist the new cadence fields. The edit page uses the same form as schedule creation. A schedule the user doesn't own SHALL answer 404.

#### Scenario: Editing a legacy schedule migrates it to new format
- **WHEN** a user submits the edit form for a legacy schedule
- **THEN** `interval_hours` is set to NULL, the new cadence fields are stored, and `next_run_at` is recomputed

#### Scenario: Editing a new-format schedule updates cadence
- **WHEN** a user submits the edit form for a new-format schedule with changed days or time
- **THEN** the cadence fields are updated and `next_run_at` is recomputed from the new values

#### Scenario: Edit form pre-populates best-effort for legacy schedules
- **WHEN** a user opens the edit form for a legacy schedule
- **THEN** the form shows time-of-day inferred from `next_run_at` (UTC), days defaulting to Mon–Fri, repeat_weeks=1, and timezone auto-detected from the browser
