## Why

The app has two competing navigation systems. The top nav exposes Home,
Schedules, History, and Settings, but "Home" (`/`) is itself a page with
client-side tabs that hide Connections and Profiles behind a second switcher
(`home.eta`, toggled by JS + `sessionStorage('home-tab')`). Two of the app's
primary surfaces are therefore nested one level deeper than the rest, the URL
doesn't reflect which surface you're on, and the combined route loads every
profile's Actual Budget accounts on every visit — even when you only want to look
at Connections.

Flattening Connections and Profiles into top-level nav siblings removes the
nested tab mechanism entirely (the URL becomes the state), lets each page load
only what it shows, and frees `/` to become a genuine landing surface. Rather
than leave `/` as a bare redirect, this change makes it a thin, read-only
dashboard: an at-a-glance status view that summarizes local state and routes into
the now-flat pages — useful precisely because the actions have moved out to their
own tabs.

## What Changes

- **Flatten the nav.** Connections and Profiles become top-level pages
  (`GET /connections`, `GET /profiles`) sitting alongside Schedules, History, and
  Settings in the top nav. The in-page tab buttons, the `.tab-panel` switching,
  and the `home-tab` `sessionStorage` JS are removed.
- **Split the combined view.** `home.eta` is split into `connections.eta`
  (the connections panel + its link/sync/relink/manage-accounts JS) and
  `profiles.eta` (the profiles panel + its mapping/pending/delete JS). Each new
  route loads only the data its page needs — the connections page no longer makes
  per-profile Actual Budget calls.
- **Add a thin dashboard at `/`.** A new read-only landing page summarizes
  local-only state with linked status cards: connection count (plus a
  relink-needed alert), profile count, most recent sync, and the next scheduled
  sync. It performs no create/edit/delete actions and makes no Plaid or Actual
  network calls — it only reads what is already in the local DB. For admins, the
  dashboard additionally shows the number of other registered users on the
  platform (`users.count()` minus the viewing admin); this card is hidden from
  non-admins.
- **i18n.** Replace `nav.home` with `nav.connections` + `nav.profiles`, add a
  `dashboard.*` catalog (en + es) including the admin other-users label and its
  empty state, and keep the existing `home.*` content keys in place on the
  connections/profiles pages to avoid mass churn. No hardcoded user-facing
  strings.

This is a navigation/presentation change. No scheduler, sync, persistence, Plaid,
or Actual behavior changes; no DB migrations; no API contract changes.

## Capabilities

### New Capabilities
- `app-navigation`: The application shell's navigation model — a flat top nav of
  sibling pages, a read-only dashboard landing at `/`, and dedicated Connections
  and Profiles pages (replacing the nested in-page tabs).

### Modified Capabilities
<!-- none — the Connections and Profiles page contents (plaid-link,
account-mapping, profile-management) are unchanged in behavior; only their
hosting route/URL moves, which is governed by the new app-navigation capability. -->

## Impact

- **Routes** (`src/routes/`): `registerHomeRoute` (`home.ts`) is repurposed to
  render the dashboard at `GET /`; new `GET /connections` and `GET /profiles`
  handlers render the split views. The connections handler drops the per-profile
  Actual account fetch; the profiles handler keeps it. `GET /profiles` does not
  collide with existing `profiles.ts` routes (`/profiles/new`, `/profiles/:id/edit`,
  POSTs).
- **Views** (`src/views/`): `home.eta` is split into `connections.eta` and
  `profiles.eta`; new `dashboard.eta`; `layout.eta` nav gains Connections +
  Profiles links and drops the Home link.
- **Styles** (`public/style.css`): add dashboard status-card styles (solid
  colors); the now-unused `.tabs` / `.tab-btn` / `.tab-panel` rules are removed if
  not referenced elsewhere.
- **i18n** (`src/i18n/en.ts`, `src/i18n/es.ts`): `nav.connections`,
  `nav.profiles`, `dashboard.*`; remove `nav.home`. Parity test must stay green.
- **Data**: dashboard reads `plaidItems.listByOwner`, `profiles.listByOwner`,
  `schedules.listByOwner` (`next_run_at`), and — for admins only — `users.count()`,
  all local, no external calls.
- **Docs**: refresh root `mental-model.html` and `README.md` at archive time.
- No DB migrations, no API contract changes, no dependency changes.
