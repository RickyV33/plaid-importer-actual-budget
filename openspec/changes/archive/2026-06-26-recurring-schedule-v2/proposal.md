## Why

The current scheduler only supports a fixed interval in hours (e.g. "every 24 hours"), which is hard to reason about and doesn't match how users think about recurring tasks. Users want to say "sync every Monday and Friday at 9 AM" — the same mental model as a recurring Google Calendar event. Additionally, the app has no way to surface important notices to users across all pages.

## What Changes

- **BREAKING (migration)**: `interval_hours` becomes a nullable legacy field. Existing schedules continue to fire on the old logic but are flagged as legacy in the UI, prompting users to recreate them.
- New schedule cadence model: days-of-week + time-of-day + repeat-every-N-weeks + timezone replaces `interval_hours` for all new schedules.
- New schedule edit flow: `GET/POST /schedules/:id/edit` with a pre-populated form — works for all schedules, critical path for migrating legacy ones.
- New app-wide notification/banner system: dismissable per-user banners rendered in the layout, backed by a `dismissed_banners` DB table. First banner: schedule migration notice.
- Legacy schedule cards show a warning and only expose Edit and Delete actions (no enable/disable toggle).

## Capabilities

### New Capabilities

- `schedule-recurrence`: Day-of-week + time-of-day + repeat-every-N-weeks + timezone cadence model for schedules, including next-occurrence computation and edit support.
- `app-notifications`: Global, per-user dismissable banner system rendered in the app layout, backed by DB, with a POST-to-dismiss route.

### Modified Capabilities

- `sync-scheduling`: Cadence model changes from `interval_hours` to structured recurrence fields. Legacy rows coexist with new rows; the scheduler branches on which model a row uses. `next_run_at` advance logic changes for new-format schedules.

## Impact

- **DB**: New migration adds `days_of_week`, `time_of_day`, `repeat_weeks`, `timezone` to `schedules`; adds `dismissed_banners` table.
- **Routes**: New `POST /banners/:key/dismiss`, `GET /schedules/:id/edit`, `POST /schedules/:id/edit`; updated `POST /schedules` create handler.
- **Scheduler runner**: `markRan` advances `next_run_at` via two code paths (legacy vs. new).
- **Views**: `layout.eta` gains banner slot; `schedules.eta` gains legacy card variant and edit button; new `schedules_form.eta` shared partial used by both create and edit.
- **i18n**: New translation keys for recurrence UI, legacy warning, banner message, edit form labels.
