## Why

The Schedules page mixes browsing and creation on one screen — the new-schedule
form sits permanently below the list — while the Profiles page uses a calmer
"list + New button → dedicated form page" model. The list also conveys a
schedule's enabled/disabled state with plain inline text, which is easy to miss
and inconsistent with the icon-driven, scannable rows used elsewhere. This change
aligns Schedules with the established Profiles UX so the two primary management
pages feel consistent.

## What Changes

- Move new-schedule creation off the list page into its own page at
  `GET /schedules/new`, reached via a "New schedule" button in a page header
  (mirroring the Profiles header + `/profiles/new` pattern). The inline create
  card is removed from the list page. The create form reuses the existing
  `partials/schedules_form` partial; the `POST /schedules` handler is unchanged.
- Convey enabled/disabled status visually: each schedule row shows a status
  badge (green "Active" / grey "Paused") and disabled rows render in a dimmed
  state, replacing the inline "enabled ·/disabled ·" text.
- Replace the text "Enable/Disable" submit button with an icon toggle button
  (`fa-toggle-on` when enabled, `fa-toggle-off` when disabled), sitting alongside
  the existing edit/delete row-action icons. The underlying
  `POST /schedules/:id/toggle` behavior is unchanged.
- Add Spanish + English catalog strings for the new status labels and toggle
  affordances; no hardcoded user-facing strings.

This is a UI/presentation change only. No scheduler, recurrence, persistence, or
billing behavior changes.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `sync-scheduling`: Adds a presentation requirement for how schedules are
  listed and created in the UI — dedicated creation page reached from a header
  button, visual (badge + dimmed-row) status indication, and an icon toggle for
  enable/disable. No change to storage, fan-out, or scheduler-firing
  requirements.

## Impact

- **Routes** (`src/routes/schedules.ts`): add `GET /schedules/new` rendering the
  create form; the list route stops passing the create form into the list view.
  `POST /schedules`, `/toggle`, `/edit`, `/delete` unchanged.
- **Views** (`src/views/`): `schedules.eta` gains a header with a "New schedule"
  button and status badges, dims disabled rows, and uses an icon toggle; new
  `schedules_new.eta` hosts the create form (reusing `partials/schedules_form`).
- **Styles** (`public/style.css`): add `.badge-active` / `.badge-paused` (reusing
  the existing `.badge` base) and a dimmed disabled-row state; reuse
  `.profiles-header` / `.icon-btn` patterns.
- **i18n** (`src/i18n/en.ts`, `src/i18n/es.ts`): new keys for "Active"/"Paused"
  status and toggle aria-labels; existing `schedules.enable`/`disable` repurposed
  as button titles/aria-labels.
- **Docs**: refresh root `mental-model.html` and `README.md` at archive time.
- No DB migrations, no API contract changes, no dependency changes.
