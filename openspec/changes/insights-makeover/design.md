## Context

plaid-importer is a Fastify app that renders Eta templates, with a little inline
vanilla JS per page (Plaid Link, sync buttons, mapping selects). Styling is one
hand-grown `public/style.css`. Font Awesome comes from cdnjs.

Media Insights is a React + Vite SPA whose look we want: `web/src/styles.css`
(tokens for light and dark, Playfair Display / DM Sans / DM Mono), components
`PageIntro`, `Panel`, `HeroNumber`, `BarList`, `RankList`, `ItemPanel`
(calm rows, icon actions on hover/focus), `Notice`, `Segmented`, and a header
with a theme pill and language select over an underlined tab strip.

The data the new views need already exists locally: `sync_runs`
(`started_at`, `status`, `total_imported`, owner), `sync_account_results`
(per account and profile), `plaid_items.last_synced_at` / `status`,
`countPullsForItemSince` for rate-limit usage, `profile_account_mappings`, and
`schedules` + `nextOccurrence()` for upcoming runs.

## Goals / Non-Goals

**Goals:**
- One design system, ported from Media Insights, applied to every page.
- Show what the app already knows: trends, health, routing, upcoming runs.
- Keep every existing behavior, endpoint, and client script contract working.
- Stay within the repo's frontend rules: mobile first, flexbox first, i18n
  catalog, no emoji, solid colors (gradients only for backgrounds), SVG imagery,
  Font Awesome for a non-React app, CRUD as icons, calm rows.

**Non-Goals:**
- No React/Vite rewrite, no client-side router, no JSON API for pages.
- No new sync, scheduling, or mapping behavior; no migrations.
- No charting library.
- No per-user stored preferences in the DB (theme lives in the browser,
  language in a cookie).

## Decisions

### Stay server-rendered; port the CSS and re-express components as Eta partials
The Media Insights look is ~90% CSS. Its React components are thin markup
wrappers, which map cleanly to Eta partials (`partials/page_intro`,
`partials/metric`, `partials/bar_list`, `partials/column_chart`,
`partials/meter`). Interactions that need JS (theme, count-up, disclosure,
relative time) go in one shared `public/app.js`.
*Alternative:* migrate to React + Vite to reuse components verbatim. Rejected:
every route, form post, and the Plaid Link flows would need an API and a
rewrite, which is far more risk than a restyle warrants. It stays possible
later because the class names and tokens will match.

### Copy the token sheet, keep the class vocabulary
`public/style.css` is rewritten starting from Media Insights' `styles.css`
(same token names, same class names: `.panel`, `.page-intro`, `.hero-card`,
`.metric-grid`, `.bar-list`, `.row-list`/`.row`/`.row-actions`, `.notice`,
`.icon-button`, `.primary`/`.secondary`, `.segmented`, `.tabs`, `.chip`).
App-specific additions (column chart, routing row, week strip, chips) are
written in the same style and appended. Old class names are dropped as their
templates move over; nothing keeps the old sheet alive.

### Fonts are vendored woff2 files
Copy the latin-subset woff2 files for DM Sans (400/500/600/700), DM Mono
(400/500) and Playfair Display (600/700) into `public/fonts/` with their OFL
license, declared via `@font-face` with `font-display: swap`.
*Alternatives:* Google Fonts (third-party request on a finance app, privacy
cost); `@fontsource` npm packages served from `node_modules` (the production
image prunes dev deps; serving package internals is brittle).

### Charts are HTML/CSS, computed on the server
- **Bar list**: identical markup to Media Insights' `BarList` (label, track,
  value + share as text, hover/focus tooltip).
- **Column chart** (imports per day): a flex row of columns whose heights are
  inline percentages; each column is focusable with a tooltip (date, count),
  plus a visually-hidden table with the same numbers. Zero days render as a
  hairline so the time axis is still readable. Axis labels: first, middle, and
  last date only.
- **Meter**: Media Insights' `.meter` (rate-limit usage, mapping coverage), with
  the figures always written next to it.
No SVG path math or charting library is needed for these shapes; Recharts would
only matter for line/area charts, which this change doesn't use.

### Insights are pure functions over plain rows
`src/insights/` exports pure functions (`dailySeries`, `byConnection`,
`outcomeSummary`, `freshness`, `rateLimitUsage`, `coverage`, `upcomingWeek`)
that take rows and a `now`/time zone, and return view-ready numbers. Routes
fetch rows with a few new read-only queries (`syncRuns.listSinceByOwner`,
`syncAccountResults.importedByAccountSince`) and call these. This keeps the
logic unit-testable without a DB and keeps templates logic-free.

### Day buckets use the viewer's time zone
`app.js` writes the browser's IANA zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`)
to a `tz` cookie. `render`/routes read it, validate it (`Intl` accepts it), and
fall back to `UTC`. `dailySeries` buckets with `Intl.DateTimeFormat(…, {timeZone})`
date parts. The first visit before the cookie exists buckets in UTC; that page
reloads into correct buckets on the next view, which is acceptable.
*Alternative:* ship raw runs to the client and bucket there. Rejected: moves
logic out of tested server code and renders an empty chart until JS runs.

### Theme: browser-only, applied before paint
Inline `<script>` in `<head>` reads `localStorage["pi-theme"]` (try/catch),
else `prefers-color-scheme`, and sets `data-theme` on `<html>` — same approach
as Media Insights' `index.html`. The header pill toggles and stores it. Without
JS the page follows the OS via a `prefers-color-scheme` block guarded by
`:root:not([data-theme="light"])`.

### Language: cookie overrides Accept-Language
`resolveLocale(acceptLanguage, cookieLang?)`: a supported `lang` cookie wins,
otherwise the existing header negotiation. The header `<select>` sets the cookie
(1 year, `SameSite=Lax`, `Path=/`) and reloads. Login/register pages get the
picker too.

### Relative times and count-up are progressive enhancement
Server renders absolute times (existing `.local-ts` pattern). `app.js` rewrites
`.rel-ts[data-ts]` with `Intl.RelativeTimeFormat` in the page's `lang` and keeps
the absolute time in `title`. Hero figures render their final value; `app.js`
counts up from zero over 900 ms only when `prefers-reduced-motion` is not set.
Bar and column fills grow in with a CSS transition gated the same way.

### Connection-health banners come from the last recorded outcome
Showing a banner on every page can't depend on live calls (each Actual check
downloads a budget). Instead `src/insights/health.ts` (pure) takes:
- per owned profile, the result rows of the **latest run that recorded results
  for that profile** (one owner-scoped query), and
- the owner's items with `status = 'requires_relink'`,
and returns incidents:
- `actual_unreachable` (error): any of those rows has a reason starting
  `actual_unreachable` → "Can't reach the Actual budget <profile>." Link:
  Profiles. Copy notes that transactions wait in the journal and go through on
  the next successful sync, which is true (watermarks don't advance on failure).
- `import_failed` (warn): failures with any other reason → "Some transactions
  couldn't be imported into <profile>." Link: History.
- `relink` (error): "<bank> needs to be reconnected." Link: Connections.
Because only the latest run per profile is considered, an incident clears as
soon as a later run for that profile succeeds; relink clears when the item goes
back to `active`.

Each incident has a key that names the incident, not just the condition:
`health:actual:<profileId>:<runId>`, `health:import:<profileId>:<runId>`,
`health:relink:<itemId>:<updatedAt>`. Dismissal reuses `dismissed_banners` and
`POST /banners/:key/dismiss` unchanged, so dismissing hides that incident only,
and a later failing run (new run id) shows again.
*Alternatives:* a live Actual ping cached for N minutes (adds background I/O and
a cache to invalidate; the sync itself already is the probe); never dismissable
(nags during a known outage).

`render.ts` merges health incidents ahead of the existing named banners; the
layout renders both as notices with an icon, the message, a "Fix" text link, and
a dismiss icon button.

### Navigation shell
Header: title + version on the left; theme pill, language select, and a
sign-out pill on the right. Below, a `.tabs` strip: Overview, Connections,
Profiles, Schedules, History, Settings (admin). The active tab is derived
from the request path in `src/views/nav.ts` (sub-pages count toward their
section), so routes don't pass anything (`aria-current="page"`). The strip scrolls
horizontally on small screens rather than wrapping.

### Page-by-page mapping
- **Overview (`/`)**: hero (30-day imported + 7/60/90 pills | next sync side);
  metric grid (connections + relink alert, profiles, accounts routed + meter,
  success rate, other users for admins); two-col panels: imports per day,
  imports by connection; "Sync status" row list (freshness chip, last, next).
- **Connections**: page intro with actions (Sync all, Sync selected, Link
  bank as icon + label); one panel per connection: status chip, freshness,
  rate-limit meter; account rows (checkbox, name ····mask, type, "feeds N
  budgets", 30-day imported) with remove/manage actions revealed on hover.
  Existing element ids/classes the inline script uses are kept or the script is
  updated in the same task.
- **Profiles**: a panel per profile: name, host + budget id (no secrets),
  coverage meter, edit/delete icons revealed on hover; routing rows grouped by
  connection: account → arrow → Actual select → pending switch.
- **Schedules**: week strip (seven day columns from today, each listing the
  runs that fall on it with time and name), then schedule rows (name + chip,
  recurrence, connections · next) with toggle/edit/delete on hover.
- **History**: 30-day metrics, 90-day column chart, run rows with chevron
  disclosure revealing per-account result rows; pager as secondary buttons.
- **Settings / forms / auth**: panels; settings uses `two-col` for sync limit
  and initial history; admin profile list becomes calm rows.

## Risks / Trade-offs

- [Restyle breaks an inline script selector] → keep ids/data-attributes the
  scripts rely on; each page task includes a manual pass of its flows in the
  dev container, and existing route tests stay green.
- [Big CSS rewrite leaves pages half-styled mid-change] → the new sheet lands
  first with the shell, then pages move one per task; the old classes each page
  needs are deleted only when that page moves.
- [Time-zone cookie is spoofable] → it only changes bucketing for the viewer's
  own data; it is validated through `Intl` and never interpolated into SQL.
- [Hover-only actions on touch] → `@media (hover: none)` keeps row actions
  visible, as in Media Insights.
- [Color contrast in dark mode] → reuse Media Insights' validated tokens
  (including dark `--on-accent`) rather than inventing new ones.
- [Font payload] → eight latin woff2 files, cached by `@fastify/static`; system
  fallbacks in every stack.

## Migration Plan

Pure presentation plus read-only queries: deploy normally. Rollback is a
redeploy of the previous image; there's no data to undo. Cookies `lang` and `tz`
are ignored by older builds.

## Open Questions

- None blocking. Whether to later move to React to share components with Media
  Insights is left for a separate change.
