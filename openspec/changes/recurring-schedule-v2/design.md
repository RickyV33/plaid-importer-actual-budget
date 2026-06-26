## Context

The scheduler currently stores a single `interval_hours` integer per schedule and advances `next_run_at` by `now + interval_hours * 3600_000` after each run. This works but is not how people think about recurring syncs — users want day-of-week + time-of-day recurrence (think Google Calendar). Additionally there is no mechanism to surface app-wide notices to users.

Production data exists with `interval_hours` rows. The new model cannot faithfully represent sub-day or odd-hour intervals (e.g. "every 6 hours"), so old rows are preserved as legacy and coexist with new-format rows in the same table.

## Goals / Non-Goals

**Goals:**
- Replace `interval_hours` cadence with days-of-week + time-of-day + repeat-every-N-weeks + timezone for new schedules
- Support editing any schedule (create and edit share one form partial)
- Show legacy schedule cards with a warning + Edit/Delete only (no toggle)
- Ship a reusable per-user dismissable banner system; first banner is the schedule migration notice

**Non-Goals:**
- Sub-day recurrence (every 6 hours, every 15 minutes)
- Converting existing `interval_hours` rows automatically — users migrate via edit
- Timezone management beyond storing and using an IANA string the browser provides

## Decisions

### D1: New cadence fields alongside nullable `interval_hours`

Add `days_of_week TEXT`, `time_of_day TEXT`, `repeat_weeks INTEGER`, `timezone TEXT` to `schedules`. Keep `interval_hours` nullable. A row is "legacy" when `days_of_week IS NULL`. The runner branches: legacy rows use the old advance logic; new rows use `nextOccurrence()`.

**Alternative considered**: Drop `interval_hours` and convert all existing rows. Rejected — conversion is lossy for non-24h intervals and silently changes user-configured behavior.

**Note**: `interval_hours` is a candidate for removal in a future release once all legacy schedules have been migrated.

### D2: next-occurrence computed in server-side TypeScript, not SQL

`nextOccurrence(daysOfWeek, timeOfDay, repeatWeeks, timezone, anchor)` is a pure function in the scheduler module. It finds the earliest future calendar day in `daysOfWeek` that is at least `repeatWeeks * 7` days after `anchor`, then converts `timeOfDay` to an epoch ms in `timezone` using `Intl.DateTimeFormat` / `Temporal`-style offset math (no external dependency — Node 18+ has `Intl` sufficient for this).

**Alternative considered**: Store a cron expression. Rejected — overkill for this use case and harder to render back into a human-readable UI.

### D3: Timezone stored on the schedule, auto-detected in the browser

The browser sends `Intl.DateTimeFormat().resolvedOptions().timeZone` as a hidden field on form submit. It is shown as an editable `<select>` (IANA list) so users can correct it. No timezone is stored on profiles or users — schedules are the only place time-of-day semantics matter.

### D4: Banner system backed by `dismissed_banners` DB table

`dismissed_banners(user_id INTEGER, banner_key TEXT, dismissed_at INTEGER), PK(user_id, banner_key)`. Every authed render checks which keys the user has dismissed; any active banner key not in that set is passed to the layout template. Dismissal is a `POST /banners/:key/dismiss` that inserts a row; JS hides the banner element without a page reload.

Active banner keys are defined as a static array in server code. Adding a new banner = adding a string to that array plus a translation key.

**Alternative considered**: localStorage/cookie dismiss. Rejected — doesn't survive device switches or browser clears, and the app already has per-user DB rows everywhere.

### D5: Shared form partial for create and edit

`schedules_form.eta` renders the recurrence fields (days, time, timezone, repeat_weeks, connections). `GET /schedules` embeds it with empty defaults; `GET /schedules/:id/edit` embeds it pre-populated from the existing row (best-effort for legacy: infer time-of-day from `next_run_at` UTC, default days to Mon–Fri, repeat_weeks=1, timezone from browser on load). `POST /schedules/:id/edit` validates and updates the row, clearing `interval_hours` and setting the new fields.

## Risks / Trade-offs

- **Legacy schedules keep firing indefinitely** if users never edit them → Mitigation: persistent banner + per-card warning create strong nudges; no hard cutoff avoids silently breaking workflows.
- **Timezone auto-detection can be wrong** (VPN, shared server) → Mitigation: the field is always editable; label says "detected — please verify."
- **`nextOccurrence` edge cases** (DST transitions, repeat_weeks anchor drift) → Mitigation: pure function is unit-testable; anchor is always `last_run_at` so drift resets on each run.
- **`dismissed_banners` query on every page load** → one indexed read per authed request; negligible at this scale.

## Migration Plan

1. Deploy migration `0008_schedule_v2.sql`:
   - `ALTER TABLE schedules` to add four nullable columns
   - `CREATE TABLE dismissed_banners`
   - No data backfill — existing rows remain valid legacy rows
2. Deploy updated server code (new routes, updated runner, new views)
3. Banner `"schedule_migration_v1"` becomes active immediately for all users with legacy schedules
4. Users edit or delete legacy schedules at their own pace
5. Future release: add migration to `DROP COLUMN interval_hours` once confirmed no legacy rows remain

Rollback: the old server binary is compatible with the new schema (extra nullable columns are ignored). Rolling back drops the new routes and UI but leaves data intact.

## Open Questions

- Should the timezone `<select>` show all IANA zones or a curated common subset? (Recommendation: curated ~40-zone list for UX; full list available via "Other".)
- Should `POST /schedules/:id/edit` on a legacy schedule also auto-dismiss the migration banner, or leave that to the user? (Recommendation: leave to user — they may have multiple legacy schedules.)
