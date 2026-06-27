## Context

Schedules are stored in the `schedules` table (`src/db/queries.ts`,
`ScheduleRow`) and listed by `GET /schedules` in `src/routes/schedules.ts`, which
derives each row's title from the connection names
(`connectionNames.join(", ")`). The non-legacy row in `src/views/schedules.eta`
puts the status badge, day list, time, repeat cadence, and next-run all in one
muted `<p>`, with the time printed as the stored 24-hour `time_of_day`.

The create/edit forms already share `partials/schedules_form.eta`
(`schedules_new.eta` and `schedules_edit.eta` both include it), so a new field is
added once. The cadence is stored as discrete fields (`days_of_week`,
`time_of_day`, `repeat_weeks`, `timezone`); legacy rows are identified by
`days_of_week IS NULL` and keep their existing single-line interval rendering.

## Goals / Non-Goals

**Goals:**
- An optional, owner-supplied name per schedule that survives create/edit and
  falls back to the connection names when blank.
- A three-line, scannable row: name + status / recurrence / connections + next.
- 12-hour time in the read view without changing stored data or the edit input.
- en + es catalogs updated; no hardcoded strings.

**Non-Goals:**
- No change to scheduler firing, recurrence computation, fan-out, or DB schema
  beyond the single nullable `name` column.
- No change to the cadence form's existing fields or to the `/schedules`
  endpoints' request/response semantics.
- Legacy schedules keep their current single-line rendering and warning.
- No uniqueness constraint on names (two schedules may share a name).

## Decisions

**1. Store name as a nullable `TEXT` column; treat blank as absent.** Migration
`0012_schedule_name.sql` adds `name TEXT` (nullable, no default). The route
trims submitted input and stores `NULL` when empty, so "no name" and "blank
name" are the same state. The list view's title is
`name?.trim() ? name : connectionNames.join(", ")`.
- *Alternative considered:* `NOT NULL DEFAULT ''`. Rejected — a nullable column
  keeps "unset" distinct and lets the fallback live in one place without
  treating empty strings specially in SQL.

**2. Name is optional and non-unique.** The field is never required; submitting
without it is valid and preserves today's behavior for every existing schedule.
No uniqueness check — the name is a label, not an identifier, and the connection
list already disambiguates when needed.

**3. Reuse the shared form partial for the input.** Add the name input to
`partials/schedules_form.eta` so both create and edit get it from one place.
Edit pre-fills from the stored value. The input is plain text with a sensible
`maxlength`; validation is limited to trimming and length.

**4. Three-line row layout, additive to the existing status requirement.** The
status badge already conveys enabled/disabled (existing requirement); this change
relocates it to sit beside the name on line 1 and splits the remaining text:
line 2 is the recurrence (days · time · repeat), line 3 is the connections and
next-run. Legacy rows are untouched. This is layout only — the toggle/status and
edit/delete row actions keep their current behavior and markup.

**5. 12-hour time is a display transform.** Format `time_of_day` (`"HH:MM"`) to
`h:mm AM/PM` in the view/route at render time. The stored value stays 24-hour and
the edit form keeps `<input type="time">` (24-hour), so round-tripping is
unaffected. The next-run timestamp continues to use `toLocaleString()`.
- *Alternative considered:* store a 12-hour string. Rejected — the time input and
  recurrence math both expect 24-hour; formatting on display avoids a data
  change.

## Risks / Trade-offs

- *Longer rows on small screens* → the three lines stack naturally under the
  existing mobile-first `.list-row`; the name wraps and the actions stay in the
  header row. No new layout primitives.
- *Untitled schedules must not look empty* → the connection-name fallback
  guarantees a non-empty title, identical to today's output.
- *i18n of the 12-hour suffix* → use a locale-aware time format so AM/PM follows
  the active locale rather than hardcoding "AM"/"PM".
- *Migration safety* → adding a nullable column is a pure `ALTER TABLE ADD
  COLUMN`, applied by the existing idempotent migration runner; no backfill and
  no table rebuild.
