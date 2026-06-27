## Why

On the Connections page, the per-connection row actions are inconsistent with the
rest of the app: "Manage accounts" is a text button, while unlink is an icon
(`fa-link-slash`). Elsewhere — Schedules, Profiles — row CRUD actions are
icon-only and hover-revealed, per the project's frontend conventions ("CRUD
actions use icons"; "list rows reveal edit + delete on hover, each conveyed with
an icon"). This change makes the connection row actions match.

## What Changes

- Replace the text "Manage accounts" button with an icon control. Use
  `fa-list-check` (managing which accounts are shared reads as a checklist),
  rather than a generic pencil, so the icon conveys its specific purpose.
- Keep unlink as an icon, retaining `fa-link-slash` (more semantic for
  "disconnect a bank" than a generic trash), now sitting consistently beside the
  manage-accounts icon.
- Both actions carry accessible labels/titles and follow the existing
  hover-revealed row-action pattern. Behavior of both flows is unchanged.
- Update English + Spanish labels as needed for the icon controls; no hardcoded
  strings.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `account-selection-management`: the manage-account-selection action is
  presented as an accessible icon control consistent with the app's other
  icon-driven row actions, instead of a text button. The underlying flow
  (account-selection token → Plaid Link → refresh accounts) is unchanged.

## Impact

- **Views** (`src/views/connections.eta`): change the `.manage-accounts-btn`
  from a text button to an `.icon-btn` with `fa-list-check` and an
  `aria-label`/`title`; the unlink `.remove-btn` keeps `fa-link-slash`. The
  associated click handlers are unchanged.
- **Styles** (`public/style.css`): reuse the existing `.icon-btn` /
  `.row-actions` patterns; minor adjustments only if needed.
- **i18n** (`src/i18n/en.ts`, `src/i18n/es.ts`): ensure the manage-accounts
  string works as an icon label/title (reuse `home.manageAccounts`).
- **Docs**: refresh root `mental-model.html` and `README.md` at archive time.
- No routes, migrations, API contracts, or dependency changes.
