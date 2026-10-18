## Context

plaid-importer is a Fastify app with SQLite, cookie sessions, Plaid, Actual,
and an in-process scheduler. Its pages were Eta templates with a little inline
vanilla JS each (Plaid Link, sync buttons, mapping selects); actions mostly end
in `location.reload()` and errors in `alert()`.

Media Insights is a React 19 + Vite SPA served by a small node server. Its
look lives in `web/src/styles.css` (light/dark tokens; Playfair Display, DM Sans,
DM Mono) and its UX in a handful of components: `PageIntro`, `Panel`, `Notice`,
`HeroNumber`, `BarList`, `RankList`, `ItemPanel` (calm rows, icon actions on
hover/focus), `Segmented`, a header with a theme pill and language select over a
tab strip, and `motion` for count-ups and transitions. Types flow from server
modules into `web/src/api.ts`.

The data the new views need already exists locally: `sync_runs`,
`sync_account_results` (per account and profile), `plaid_items` status and last
sync, `countPullsForItemSince` for rate-limit usage, `profile_account_mappings`,
and `schedules` + `nextOccurrence()`.

The first part of this change (already landed) added `src/insights/` (pure
figures), read-only queries, health incidents, the locale cookie, the Media
Insights stylesheet and fonts, and Eta versions of the shell, Overview and
Connections. This design moves the signed-in pages to React; the Eta page work
is superseded, the rest carries over.

## Goals / Non-Goals

**Goals:**
- The same frontend stack and components as Media Insights for every signed-in
  page, so the two apps share UX and code shape.
- Show what the app already knows: trends, health, routing, upcoming runs.
- Actions update in place: no full reloads, no `alert()`.
- Keep every page URL, the auth flow, Plaid Link flows, and all sync/scheduler
  behavior unchanged.
- Repo frontend rules: mobile first, flexbox first, one i18n catalog (en + es),
  no emoji, solid colors, SVG icons from `react-icons`, CRUD as icons, calm rows.

**Non-Goals:**
- No backend rewrite (Media Insights' `node:http` + JSON files would be a step
  down here: no auth, no SQL).
- No change to sign-in pages' flow; they stay server-rendered.
- No inline editing of profiles or schedules (their forms keep dedicated pages,
  which the specs require); only small toggles and selects act in place.
- No charting library; no component test framework (pure modules are tested).

## Decisions

### React SPA for signed-in pages; server keeps Fastify
`web/` holds a Vite + React app built to `dist/web/` with `base: "/static/app/"`.
Fastify serves it under `/static/app/` (already outside the auth allowlist
question, since `/static/*` is exempt) and answers every page URL — `/`,
`/connections`, `/profiles`, `/profiles/new`, `/profiles/:id/edit`,
`/schedules`, `/schedules/new`, `/schedules/:id/edit`, `/history`, `/settings`,
`/link/oauth-return` — with the app's `index.html`, behind the existing auth
gate. So bookmarks, the Plaid OAuth redirect URI, and `?next=` all keep working.
*Alternative:* finish the Eta restyle (rejected: every interaction needs bespoke
JS, and nothing is shared with Media Insights); hash routing like Media Insights
(rejected: would change URLs, including the registered OAuth redirect).

### Client routing over the History API
A small router (`web/src/router.ts`, pure path matching + a `useRoute` hook on
`popstate`) maps paths to pages and intercepts same-origin `<a>` clicks. Page
switches animate with `motion` (`AnimatePresence`), as in Media Insights.
*Alternative:* react-router (rejected: a dependency for ~10 static routes).

### Sign-in stays server-rendered
`GET/POST /login`, `GET/POST /register`, `POST /logout`, rate limiting, and
`next` handling are untouched. `login.eta`/`register.eta` and a slimmed
`layout.eta` (no tabs) use the shared `/static/style.css`; a tiny inline script
does the theme switch and language picker; the two icons there are inline SVGs.

### JSON API: view models move out of the page routes
Today's page handlers already assemble view objects. Those move into
`src/api/*.ts` as functions (`overviewFor(userId, now, tz)`, `connectionsFor`,
`profilesFor`, `schedulesFor`, `historyFor`, `settingsFor`), registered as
`GET /api/<page>` in `src/routes/api.ts`. Their return types are exported and
imported by `web/src/api.ts`, as Media Insights does, so client and server can't
drift without the typecheck noticing.

Form posts become JSON endpoints with the same zod validation and error keys,
returned as `{ error: "<i18n key>" }` with the same status codes:
`POST /api/profiles`, `PUT /api/profiles/:id`, `GET /api/profiles/:id`,
`POST /api/schedules`, `PUT /api/schedules/:id`, `GET /api/schedules/:id`,
`POST /api/schedules/:id/toggle`, `PUT /api/settings/registration-secret`,
`PUT /api/settings/sync-limit`, `PUT /api/settings/initial-history`. Endpoints
that are already JSON keep their paths. `GET /api/me` returns the user, role,
and version; `GET /api/banners` returns health incidents and named banners.

### Auth gate: `401` for the API
`authPreHandler` keeps its allowlist. For a protected path under `/api/`, an
unauthenticated request gets `401 { error: "unauthenticated" }` instead of the
login redirect, so `fetch` callers can react. The app's API client sends the
browser to `/login?next=<current path>` on `401`. Mutations are JSON-only
(Fastify parses bodies by content type), so a cross-site form can't post to
them, and the session cookie stays `SameSite=Lax`.

### One catalog, imported by the app
`src/i18n/en.ts` / `es.ts` stay the single catalog. The app imports them
(`import { en } from "../../src/i18n/en"`) and adds Media Insights' provider
shape (`t`, number/percent/date formatters bound to the locale). Initial locale:
the `lang` cookie if supported, else the first supported entry of
`navigator.languages`, else `en`, matching the server rule. Switching sets the
cookie and re-renders without a reload. Health and named banners arrive as data
(kind, subject, key) and are translated in the app.

### Viewer time zone travels as a query parameter
Endpoints that bucket by day (`/api/overview`, `/api/history`, `/api/schedules`)
take `?tz=<IANA zone>`; the API client adds the browser's zone. The server
validates it with `safeTimeZone` (falls back to UTC). The `tz` cookie from the
first part of the change is dropped.

### Theme
Same as Media Insights: `useTheme` hook with `localStorage["pi-theme"]`
(guarded), OS preference by default, a pre-paint script in `index.html` (and in
`layout.eta`) sets `data-theme`, and the stylesheet's OS-dark block covers the
moment before it runs.

### Stylesheet and fonts are shared, not bundled
`public/style.css` (Media Insights' tokens and class vocabulary plus this app's
pieces) and the vendored `public/fonts/` stay where they are, served at
`/static/`. The app links `/static/style.css` from `index.html` instead of
importing CSS through Vite, so the sign-in pages and the app use one file.

### Dev uses Vite's backend integration, not a proxy
In production the shell route serves `dist/web/index.html`. In development
(`VITE_DEV_SERVER` set, e.g. `http://localhost:5173`), it serves the same shell
with module scripts pointing at the Vite dev server (`@vite/client` and
`src/main.tsx`), so the app, API, cookies, and redirects all live on Fastify's
origin and Vite only supplies modules and HMR. No proxy list to keep in sync.

### Components
Ported from Media Insights with the same props and class names: `PageIntro`,
`Panel`, `SectionHead`, `Notice`, `HeroNumber` (count-up, reduced-motion aware),
`BarList` (value + share as text, tooltip). New in the same style: `ColumnChart`
(flex columns, focusable with labelled tooltips, hidden table), `Meter`,
`FreshnessChip`, `Row` (calm row with hover/focus actions), `ConfirmButton`
(icon button that asks with `window.confirm`, as Media Insights does). Icons
come from `react-icons/fi`.

### Plaid Link
`web/src/plaid.ts` loads Plaid's script once and exposes
`openLink(token, { onSuccess, onExit, receivedRedirectUri? })`. Pages call the
existing endpoints exactly as the old inline scripts did: link
(`/link/token` → `/link/exchange`), relink (`update-token` → `mark-active`),
manage accounts (`account-select-token` → `refresh-accounts`), and the OAuth
return page (re-open with the stored token and `receivedRedirectUri`). After a
success the page re-fetches its data instead of reloading.

### Insights stay pure functions over plain rows
Unchanged from the first part: `src/insights/` computes daily series (viewer's
zone), shares by connection, outcome summaries, freshness, rate-limit usage,
coverage, and the upcoming week; the API builders call them.

### Connection-health banners come from the last recorded outcome
Unchanged in substance: `healthIncidents()` over the latest run per profile and
relink-flagged items, keyed per incident
(`health:actual:<profileId>:<runId>`, `health:import:…`, `health:relink:<itemId>:<updatedAt>`)
so a dismissal hides one incident and a later failure shows again. They're
served by `GET /api/banners` (ahead of named banners, dismissed keys removed),
rendered by the app shell on every page, and re-fetched after a sync. No live
Plaid or Actual calls.

### Page-by-page mapping
- **Overview**: hero (30-day imported + 7/60/90 pills | next sync), metric grid
  (connections + relink alert, budgets, accounts routed + meter, success rate,
  other users for admins), imports per day, imports by connection, sync status
  rows.
- **Connections**: intro actions (Sync selected, Sync all, add bank icon); a
  panel per bank with status/freshness chips, rate-limit meter, account rows
  (checkbox, name, mask, type, budgets fed, 30-day imports; remove icon for
  deselected accounts); results as notices on the panel.
- **Profiles**: a panel per profile (name, host · budget, coverage meter,
  edit/delete icons on hover); routing rows grouped by bank (account → Actual
  select → pending switch), saved in place. Create/edit at `/profiles/new` and
  `/profiles/:id/edit` with the budget loader.
- **Schedules**: week strip, then calm rows (name + chip, recurrence, banks ·
  next) with toggle/edit/delete; create/edit pages with the day picker as a
  segmented control.
- **History**: 30-day metrics, 90-day column chart, expandable run rows with
  per-account results, pager, orphan notice with acknowledge.
- **Settings** (admin): registration secret, sync limit, initial history as
  panels; all-profiles list as calm rows.

## Risks / Trade-offs

- [Plaid Link flows regress] → the hook calls the same endpoints in the same
  order as the old scripts; the flows are listed as a manual check against
  Plaid sandbox before archive.
- [Client and server drift] → API types are imported from the server builders;
  `tsc` checks both projects.
- [A page URL that the server doesn't answer with the app] → one route table
  shared by the server's shell route and its test.
- [Unauthenticated fetches get HTML] → the `401` branch is unit-tested; the
  client redirects to login on `401`.
- [Bundle size] → React + motion is ~175 kB gzip, loaded once and cached; a
  self-hosted LAN app.
- [No JavaScript, no app] → acceptable: Plaid Link already requires JavaScript;
  sign-in pages still work without it.
- [Dev needs two processes] → a VS Code task runs both; Vite proxies to Fastify.

## Migration Plan

Deploy normally; there's no data migration. Old HTML form endpoints are removed
in the same release as the app that replaces them. Rollback is the previous
image. Cookies (`lang`) are ignored by older builds.

## Open Questions

- None blocking.
