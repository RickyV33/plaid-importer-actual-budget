## 1. Database Migration

- [x] 1.1 Write migration `0008_schedule_v2.sql`: add `days_of_week TEXT`, `time_of_day TEXT`, `repeat_weeks INTEGER`, `timezone TEXT` nullable columns to `schedules`
- [x] 1.2 Write migration `0008_schedule_v2.sql` (continued): create `dismissed_banners(user_id INTEGER, banner_key TEXT, dismissed_at INTEGER, PRIMARY KEY(user_id, banner_key))` table
- [x] 1.3 Add `dismissed_banners` queries to `db/queries.ts`: `insert(userId, key)`, `listByUser(userId)`
- [x] 1.4 Update `ScheduleRow` type in `db/queries.ts` to include new nullable fields

## 2. Recurrence Logic

- [x] 2.1 Implement `nextOccurrence(daysOfWeek, timeOfDay, repeatWeeks, timezone, anchor): number` pure function in `scheduler/recurrence.ts`
- [x] 2.2 Add unit tests for `nextOccurrence`: weekly, bi-weekly, DST boundary, all-days, single-day edge cases
- [x] 2.3 Update `scheduler/runner.ts` `markRan` logic to branch: legacy rows use `interval_hours` advance, new rows use `nextOccurrence`

## 3. Schedule Routes

- [x] 3.1 Update `POST /schedules` create handler: accept `daysOfWeek`, `timeOfDay`, `repeatWeeks`, `timezone`; set `intervalHours=null`; compute first `next_run_at` via `nextOccurrence`
- [x] 3.2 Add `GET /schedules/:id/edit` route: fetch schedule (owner-scoped), render edit form pre-populated (infer time-of-day from `next_run_at` UTC for legacy rows, default days to Mon–Fri)
- [x] 3.3 Add `POST /schedules/:id/edit` route: validate same schema as create, clear `interval_hours`, persist new cadence fields, recompute `next_run_at`, redirect to `/schedules`
- [x] 3.4 Update `schedules.ts` queries: add `update(id, fields)` method; update `create` to accept new fields

## 4. Banner System

- [x] 4.1 Add `POST /banners/:key/dismiss` route: require auth, insert into `dismissed_banners`, return 204
- [x] 4.2 Define active banner keys constant in server code (start with `["schedule_migration_v1"]`)
- [x] 4.3 Update base render context to include `banners[]` — query `dismissed_banners` for authed users, filter active keys not yet dismissed

## 5. Views

- [x] 5.1 Create `views/schedules_form.eta` shared partial: days-of-week checkboxes, time input, timezone select (curated IANA list + auto-detect hidden field), repeat_weeks input, connections checkboxes
- [x] 5.2 Update `views/schedules.eta`: embed `schedules_form.eta` for create; add legacy card variant (warning message, Edit + Delete only, no toggle); add Edit button to new-format cards
- [x] 5.3 Create `views/schedules_edit.eta`: page wrapper that embeds `schedules_form.eta` pre-populated, with a "Save Changes" submit button
- [x] 5.4 Update `views/layout.eta`: add banner slot between topbar and `<main>`; render `it.banners` if present; include dismiss JS (fetch POST, hide element)

## 6. i18n

- [x] 6.1 Add translation keys to `i18n/en.ts`: recurrence form labels (days, time, timezone, repeat), legacy warning message, migration banner text, edit page title, save button
- [x] 6.2 Mirror new keys in `i18n/es.ts`

## 7. Cleanup & Tests

- [x] 7.1 Update `scheduler/runner.test.ts` to cover the branched advance logic (legacy vs. new-format)
- [ ] 7.2 Add a smoke test for `POST /schedules` with new fields and `GET/POST /schedules/:id/edit` — skipped: Fastify/SQLite native module fails under tsx/esm in the dev container ARM image; verify manually via the running app
- [x] 7.3 Add a `// TODO: remove interval_hours column in a future migration` comment to the migration file and to `ScheduleRow` type
