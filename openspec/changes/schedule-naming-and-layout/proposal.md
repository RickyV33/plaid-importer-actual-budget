## Why

Schedules have no human-friendly identity: each row's title is just the joined
connection names (`Chase, Amex`), so two schedules over the same connection are
indistinguishable. The row also crams status, days, time, repeat cadence, and
next-run into a single muted line, and renders the time in 24-hour form
(`09:00`), which is harder to scan than the rest of the app. This change gives
schedules an optional custom name and restructures the row so name/status,
recurrence, and connections/next-run each read on their own line.

## What Changes

- Add an optional custom `name` to schedules. The create and edit forms gain a
  name field; when a schedule has no name, the list falls back to the joined
  connection names exactly as today, so existing schedules look unchanged.
- Restructure the non-legacy schedule row into three legible lines:
  - **Line 1** — the name (or connection-name fallback) with the status badge
    beside it.
  - **Line 2** — the recurrence: days of week, time, and repeat cadence.
  - **Line 3** — the targeted connections and the next-run time.
- Display the schedule time in 12-hour `h:mm AM/PM` form in the read view. The
  stored value and the edit form's time input remain 24-hour `HH:MM`.
- Add English + Spanish catalog strings for the new name field and label; no
  hardcoded user-facing strings.

This change is additive at the data layer (one nullable column) and otherwise
presentation-only. The scheduler, recurrence math, fan-out, and the
`POST /schedules`, `/toggle`, `/edit`, `/delete` behaviors are unchanged.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `sync-scheduling`: schedules gain an optional custom name (stored, set on
  create/edit, displayed with a connection-name fallback), and the list row
  presentation is restructured into name+status / recurrence / connections+next
  lines with a 12-hour time display. No change to scheduler firing, recurrence
  computation, fan-out, or the existing endpoints' contracts.

## Impact

- **Migration** (`src/db/migrations/`): new `0012_schedule_name.sql` adding a
  nullable `name TEXT` column to `schedules`.
- **Queries** (`src/db/queries.ts`): `ScheduleRow` gains `name`; `create` and
  `update` accept and persist an optional name.
- **Routes** (`src/routes/schedules.ts`): parse an optional `name` on
  `POST /schedules` and `POST /schedules/:id/edit`; pass `name` through to the
  list and edit views; pre-fill the name on edit.
- **Views** (`src/views/`): `partials/schedules_form.eta` (or
  `schedules_new.eta`/`schedules_edit.eta`) gains a name input; `schedules.eta`
  renders the three-line layout, the name-with-fallback title, and 12-hour time.
- **Styles** (`public/style.css`): minor line/spacing tweaks for the
  multi-line row (reuse existing `.list-row`/`.badge` patterns).
- **i18n** (`src/i18n/en.ts`, `src/i18n/es.ts`): new keys for the name field
  label/placeholder.
- **Docs**: refresh root `mental-model.html` and `README.md` at archive time.
- No API contract changes, no dependency changes.
