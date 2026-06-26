## Context

The Schedules page (`src/views/schedules.eta`, served by `GET /schedules` in
`src/routes/schedules.ts`) currently renders the list of schedules followed by an
always-present "New schedule" card containing the create form. Each row shows
state as inline text (`enabled ·` / `disabled ·`) and exposes a text
"Enable"/"Disable" submit button next to icon-only edit/delete actions.

The Profiles page already establishes the target pattern: a `profiles-header`
with title, description, and a "New profile" button linking to a dedicated form
page (`GET /profiles/new` → `profile_form.eta`), calm list rows with hover-revealed
icon actions, and an `.icon-btn` visual language. The schedule **edit** flow is
already a separate page (`GET /schedules/:id/edit` → `schedules_edit.eta`), so the
form partial (`partials/schedules_form.eta`) is already reuse-ready.

This is a presentation-only change; the scheduler, recurrence math, persistence,
and the `POST /schedules`, `/toggle`, `/edit`, `/delete` handlers stay as-is.

## Goals / Non-Goals

**Goals:**
- New-schedule creation lives on its own page reached from a header button,
  consistent with Profiles.
- Enabled/disabled state is conveyed visually (status badge + dimmed row), not by
  inline text alone.
- Enable/disable is an icon toggle consistent with the row's edit/delete icons.
- No hardcoded strings; en + es catalogs updated.

**Non-Goals:**
- No change to scheduler firing, recurrence computation, or DB schema.
- No change to request/response contracts of existing schedule endpoints.
- No redesign of the cadence form itself (the partial is reused verbatim).
- Legacy schedules keep their existing warning/edit affordance unchanged.

## Decisions

**1. Dedicated create page via a new GET route, reusing the form partial.**
Add `GET /schedules/new` that renders a new `schedules_new.eta` view, which
includes `partials/schedules_form` exactly like `schedules_edit.eta` does. The
list route (`GET /schedules`) keeps passing `connections` only for the empty-state
guidance; the create form leaves the list page. `POST /schedules` is untouched —
the new page posts to the same action.
- *Alternative considered:* a modal/disclosure on the list page. Rejected — the
  whole point is to mirror the Profiles "navigate to a form page" model and keep
  the list calm.

**2. Header mirrors `.profiles-header`.** Reuse the existing `.profiles-header`
flex layout (title + desc on the left, "New schedule" button on the right linking
to `/schedules/new`). When there are zero connections, the button is replaced by
the existing `schedules.needConnections` guidance so users aren't sent to a form
they can't complete.
- *Alternative considered:* a new bespoke header class. Rejected — `.profiles-header`
  already encodes the responsive wrap behavior we want; reuse over duplication.

**3. Status as a badge + dimmed row, reusing the `.badge` base.** Add
`.badge-active` (green) and `.badge-paused` (grey) variants alongside the existing
`.badge-manual`/`.badge-scheduled`. Disabled rows get an `is-disabled` modifier on
`.list-row` that reduces opacity and uses a muted left border, so state is
legible at a glance even before reading the badge. The inline `enabled ·/disabled ·`
text is removed; the cadence/next-run summary remains.
- *Alternative considered:* color-only (just dim the row). Rejected — color alone
  is not an accessible status signal; the badge carries a text label too.

**4. Toggle as an `.icon-btn` with `fa-toggle-on`/`fa-toggle-off`.** Keep the
existing `POST /schedules/:id/toggle` form, but render its submit control as an
`.icon-btn` showing `fa-toggle-on` when enabled and `fa-toggle-off` when disabled,
with an `aria-label`/`title` of "Disable"/"Enable" respectively. The toggle icon
visually encodes current state and the action, and lines up with the edit/delete
icons in `row-actions`.
- *Alternative considered:* `fa-play`/`fa-pause`. Rejected — reads as a transport
  control; a switch better matches an on/off setting.

**5. i18n.** Add `schedules.statusActive` ("Active"/"Activo") and
`schedules.statusPaused` ("Paused"/"Pausado"). Existing `schedules.enable` /
`schedules.disable` become the toggle button's `aria-label`/`title`.

## Risks / Trade-offs

- *Accessibility of icon-only toggle* → mitigated by `aria-label` + `title` on the
  button, matching how edit/delete icon buttons are already labeled.
- *Discoverability of hover-revealed actions on touch* → already handled by the
  existing `.list-row .row-actions` rule that keeps actions visible on no-hover
  devices; the toggle inherits this.
- *Two places now post to `POST /schedules` semantics* → none: the create page is
  the only producer of that POST; the list page no longer submits it. Existing
  tests for the route stay valid.
- *Color contrast of green/grey badges* → use solid colors (no gradients) with
  sufficient contrast, consistent with existing `.badge-*` variants.
