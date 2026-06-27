## Context

The Connections page (`src/views/connections.eta`) renders each connection in a
`.list-row` with a `.row-actions` group. Today that group mixes a text button
(`.manage-accounts-btn`, "Manage accounts") with an icon button
(`.remove-btn`, `fa-link-slash` for unlink), plus a relink button when the
connection requires relinking. Schedules and Profiles already use icon-only,
hover-revealed row actions (`.icon-btn`) with `aria-label`/`title`, matching the
project conventions in AGENTS.md.

The manage-accounts flow re-opens Plaid Link in account-selection mode
(`account-selection-management`); its click handler is bound by the
`.manage-accounts-btn` selector. The unlink flow is already an icon.

## Goals / Non-Goals

**Goals:**
- Manage-accounts becomes an accessible icon control consistent with other row
  actions.
- Unlink stays an icon, keeping `fa-link-slash` for its specific meaning.
- No behavior change to either flow; no string left hardcoded.

**Non-Goals:**
- No change to routes, tokens, or the account-selection / unlink flows.
- No change to the relink button's behavior (it remains a labeled action for the
  requires-relink state).
- No change to account-level row actions inside the account table.

## Decisions

**1. Manage-accounts uses `fa-list-check`, not a generic pencil.** The action
manages *which accounts are shared* — a selection, not free-text editing — so a
checklist icon conveys its purpose more precisely than a pencil while still being
an icon consistent with the app's row actions.
- *Alternative considered:* `fa-pen` for uniformity with edit actions elsewhere.
  Rejected — it would read as "edit a field" and lose the specific meaning;
  `fa-list-check` is still an icon-only row action, satisfying the consistency
  goal.

**2. Unlink keeps `fa-link-slash`.** It is already an icon and `link-slash` is
more semantic for "disconnect a bank" than a generic trash; it now sits beside the
manage-accounts icon as a consistent icon pair.
- *Alternative considered:* switch unlink to `fa-trash`. Rejected — `link-slash`
  better communicates the connection-level disconnect.

**3. Preserve handlers and labels.** Keep the `.manage-accounts-btn` class (or
keep the existing selector working) so the bound click handler is unchanged; only
the element type/markup changes from text button to `.icon-btn` with an
`aria-label`/`title` drawn from the existing `home.manageAccounts` string.

## Risks / Trade-offs

- *Discoverability of an icon vs. a text button* → mitigated by an
  `aria-label`/`title` and by following the same hover-revealed row-action pattern
  users already see on Schedules/Profiles; touch devices keep actions visible via
  the existing `.list-row .row-actions` rule.
- *Accessibility* → the icon control carries an accessible label, matching the
  existing icon buttons (unlink, edit, delete) in the app.
- *Scope creep* → this is presentation-only; no flow or endpoint changes, so the
  risk surface is limited to the connections view markup/styles.
