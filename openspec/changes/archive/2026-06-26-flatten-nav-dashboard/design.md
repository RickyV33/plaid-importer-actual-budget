## Context

`GET /` (`src/routes/home.ts`) renders `src/views/home.eta`, a single page that
holds two `<section class="tab-panel">` blocks — Connections and Profiles —
switched entirely client-side by `.tab-btn` handlers that toggle `.active` and
persist the choice in `sessionStorage('home-tab')` (`home.eta:174`). The top nav
(`layout.eta:15`) lists Home, Schedules, History, and (for admins) Settings, so
Connections and Profiles are reachable only by first landing on Home and then
clicking an in-page tab.

The home route also eagerly loads, for every profile, that profile's Actual
Budget accounts (`home.ts:76`) so the Profiles panel's mapping selects are
populated — work that happens on every visit even when the user only wants
Connections.

The other pages already establish the target shell: each is its own route + view
reached from a single top-nav link. This change brings Connections and Profiles
into that model and repurposes `/` as a landing dashboard.

## Goals / Non-Goals

**Goals:**
- One navigation system: Connections, Profiles, Schedules, History, Settings are
  flat top-nav siblings, each its own URL.
- The nested in-page tab mechanism (buttons, panels, `sessionStorage`) is gone.
- `/` is a thin, read-only status dashboard that links into the flat pages.
- Each page loads only the data it renders.
- No hardcoded strings; en + es catalogs stay in parity.

**Non-Goals:**
- No change to the *behavior* of connection management, profile management,
  account mapping, sync, or scheduling — only where those surfaces live.
- No new Plaid or Actual calls; the dashboard adds zero external I/O.
- No DB schema or endpoint-contract changes.
- No redesign of the connections/profiles panels themselves — their markup and JS
  move verbatim into the split views.

## Decisions

**1. Three routes replace one.** `GET /` becomes the dashboard; add
`GET /connections` and `GET /profiles`. The connections handler builds only
`itemViews` (from `plaidItems` + `plaidAccounts`); the profiles handler builds
`profileViews` (including the per-profile Actual fetch). The shared helpers
(`toHomeAccount`, `accountsForItem`) are kept and reused by both.
- *Alternative considered:* keep one handler that conditionally renders. Rejected —
  defeats the point; the win is that `/connections` stops paying for the Actual
  calls.

**2. `/` is a dashboard, not a redirect.** A bare `/` → `/connections` redirect
was the simpler option, but the app has a real at-a-glance story (relink alerts,
next/last sync) currently scattered across pages. The dashboard surfaces those as
linked cards. It is strictly read-only and local-only.
- *Alternative considered:* redirect `/` → `/connections`. Rejected per the
  explicit request for a landing dashboard; the redirect remains the trivial
  fallback if the dashboard is ever dropped.

**3. Dashboard reads local DB only — no Plaid/Actual.** To stay "thin" and fast,
the dashboard derives everything from already-stored state:
- **Connections:** `plaidItems.listByOwner(userId)` → total count, and a count of
  `status === "requires_relink"` for a warning card linking to `/connections`.
- **Last sync:** the max `last_synced_at` across the owner's items → relative
  time, linking to `/history`.
- **Profiles:** `profiles.listByOwner(userId)` → count, linking to `/profiles`.
- **Next scheduled sync:** the minimum `next_run_at` among the owner's `enabled`
  schedules (`schedules.listByOwner`) → linking to `/schedules`.
  No `listAccountsForProfile` / Plaid calls occur on `/`.
- *Alternative considered:* show recent sync results / per-connection rows.
  Rejected — that's the History/Connections pages' job; the dashboard stays a
  summary.

**4. Admin-only other-users card; "active" = total registered.** For an admin
viewer, the dashboard adds a card showing the number of *other* registered users
(`users.count() - 1`). The user store has no activity/last-login tracking — no
`last_login_at`, no enabled/disabled flag (`UserRow` is id/username/hash/role/
timestamps) — so "active on the platform" is interpreted as total registered,
which needs no new query and no schema. The card is gated on
`currentUser(req)?.role === "admin"` and omitted entirely for members; a sole
admin sees an empty state, not "0".
- *Alternatives considered:* (a) count users with ≥1 non-removed connection as an
  "actually using it" proxy — defensible but needs a distinct-owner query and a
  fuzzier definition; (b) true "recently logged in" — requires a `last_login_at`
  column + recording it at auth time, i.e. a migration and an auth change, out of
  scope for this presentation-only change. Both deferred; revisit if a real
  activity signal is wanted later.

**5. Each card degrades to an empty state.** Zero connections, zero profiles, no
schedules, or never-synced each render calm guidance (e.g. "No connections yet")
rather than a number, so a fresh install's dashboard is still coherent and points
the user at the first action.

**6. i18n: split nav keys, add `dashboard.*`, keep `home.*` content keys.**
Replace `nav.home` with `nav.connections` + `nav.profiles`; add a `dashboard.*`
namespace for the card labels/empty states. The existing `home.*` content keys
(used by the connections and profiles panel markup) move verbatim with the markup
and are **not** renamed.
- *Alternative considered:* rename `home.*` → `connections.*` / `profiles.*` for
  tidiness. Deferred — it's ~40 keys × 2 locales of pure churn with regression
  risk in an otherwise mechanical move; the `home.*` name becomes a minor wart but
  can be renamed later in its own focused change. **This is the one call worth a
  second look at review.**

**7. Nav order follows the workflow.** `Connections · Profiles · Schedules ·
History · [Settings] · Logout` — link a bank, map its accounts to a profile,
schedule the sync, review history. The dashboard's cards link out in the same
order.

## Risks / Trade-offs

- *`GET /profiles` route collision* → checked: `profiles.ts` defines
  `/profiles/new`, `/profiles/:id/edit`, and POSTs, but no `GET /profiles`. The
  new index route is registered without conflict; `/profiles/new` stays matchable.
- *Dead CSS/JS after the split* → the `.tabs`/`.tab-*` styles and the
  tab-activation script are removed; grep confirms no other view references them
  before deleting.
- *Dashboard drifting toward "doing things"* → guarded by the spec: `/` is
  read-only and makes no external calls; any action belongs on the destination
  page it links to.
- *Stale `home.*` namespace name* → accepted trade-off (Decision 5); functionally
  inert since the keys keep their values and bindings.
