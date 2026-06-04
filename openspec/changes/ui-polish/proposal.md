## Why

A batch of home-page and settings UX polish after the profiles rework. The page is now one long scroll of Connections + Profiles; checkboxes are small and hard to see; the "show pending" tooltip was lost in the rewrite; the settings secret is shown in plaintext with no hide option; spacing around the "New profile" button is tight. All presentation/UX, no behavior change to syncing.

## What Changes

- **Tabs**: split the home page into "Connections" and "Profiles" tabs near the top, swappable client-side, instead of one long page.
- **Profile-scoped "select all"** for a profile's accounts (and/or the connections list), replacing the per-item-only select-all.
- **Larger custom checkboxes** that are easier to see/tap, applied across the app.
- **Restore the "show pending" tooltip** explaining the on/off behavior (lost in the profiles rewrite of `home.eta`).
- **Consistent, aligned columns** for "Mapped to" and "show pending" across all account rows.
- **Settings secret reveal**: render the registration secret obfuscated by default with an eye-toggle button to show/hide the current value (instead of always-plaintext).
- **Padding** below the "New profile" button (and general spacing pass on the profiles header).

## What Changes (frontend conventions retrofit)

Bringing the UI in line with AGENTS.md frontend conventions:
- **i18n-ready (en + es)**: all user-facing strings (server-rendered and client-side) move into a single message catalog with English fallback; locale resolved from `Accept-Language`.
- **CRUD actions use icons (SVG via Font Awesome)**: create/edit/delete/sync affordances become icon buttons, not text-only.
- **List rows calm at rest, actions on hover/focus**: profile and schedule rows reveal their edit/delete icon actions only on hover or keyboard focus.
- **Mobile-first, flexbox**: base styles target the smallest viewport; larger layouts layered via min-width media queries.

## Capabilities

### New Capabilities
- `i18n`: a message catalog (`en`, `es`) with English fallback, an `Accept-Language`-based locale resolver, and a `t()` helper exposed to server templates and to client JS.

### Modified Capabilities
- `plaid-link`: the home view gains tabs, a profile-scoped "select all", icon-based actions, and calm-at-rest connection/profile rows; all strings localized.
- `account-mapping`: mapping/pending controls render in consistent aligned columns, pending tooltip restored, localized.
- `user-management`: the settings page renders the registration secret hidden by default with an SVG reveal toggle; localized.

## Impact

- **Schema**: none.
- **Code**: `src/views/home.eta` (tabs, select-all, checkbox markup, tooltip), `src/views/settings.eta` (secret reveal toggle), `public/style.css` (tabs, custom checkbox, column alignment, spacing). Small client-side JS for tab switching and the reveal toggle. No route or query changes.
- **Depends on**: `profiles-and-budgets` (the home page grouped by profile).
- **Out of scope**: any behavioral change to mapping, syncing, or selection semantics; the duplicate-profile guard (tracked in `profiles-and-budgets`).
