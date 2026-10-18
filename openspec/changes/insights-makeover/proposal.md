## Why

The UI grew one change at a time: system fonts, flat white cards, a plain text
nav, tables everywhere, and a dashboard of bare counts. The app already records
a lot about what it does (every run, every account result, pull counts against
the rate limit, which bank account feeds which budget, when schedules fire), but
almost none of it is shown in a way you can read at a glance. Media Insights
(sibling project) has settled on a design system that does exactly that well:
editorial headlines, soft panels, one big figure per page, bar lists that carry
their numbers as text, calm list rows, and a proper light/dark theme. Adopting it
here gives the app one coherent look and a vocabulary for showing its data.

Much of what makes Media Insights pleasant is interaction rather than CSS:
instant page switches, saving without leaving the page, live notices. In
server-rendered Eta each of those needs its own hand-written script; today the
app reloads the whole page after an action in 9 places and reports errors
through 19 `alert()` dialogs. Moving the signed-in pages onto the same frontend
stack as Media Insights (React + Vite over a JSON API) lets the two apps share
components instead of imitating each other, and removes that class of friction.

## What Changes

- **Signed-in pages become a React app.** React 19 + Vite + motion +
  react-icons, built into `/static/app/`, the same stack as Media Insights. The
  server keeps Fastify, SQLite, sessions, Plaid, Actual, and the scheduler. Every
  page keeps its URL; the server answers each page URL with the app (behind the
  same auth gate) and the app reads and writes through JSON endpoints. Actions
  update the page in place; errors show as notices instead of `alert()`.
- **Sign-in stays server-rendered.** Login, register, and logout keep their
  current form-post flow and spec; their Eta pages use the same stylesheet.
- **JSON API.** Read endpoints for each page (`/api/overview`, `/api/connections`,
  `/api/profiles`, `/api/schedules`, `/api/history`, `/api/settings`, `/api/me`,
  `/api/banners`); the form posts for profiles, schedules, and settings become
  JSON endpoints with the same validation and error keys. Existing JSON
  endpoints (link, sync, mappings, deletes, banner dismiss) keep their paths.
  Unauthenticated `/api/*` requests get `401` JSON instead of a redirect.
- **Adopt the Media Insights design system.** New token-based stylesheet
  (light + dark), self-hosted Playfair Display / DM Sans / DM Mono, panels,
  page intros (eyebrow, title, one-line lede), hero card, metric grid, bar
  lists, column chart, meters, chips, notices, segmented controls, calm row
  lists with icon actions on hover/focus. Mobile first, flexbox, solid colors.
  `public/style.css` is replaced wholesale and shared by the app and the
  sign-in pages.
- **New app shell.** Title row with a theme toggle and a language picker; the
  primary pages become an underlined tab strip with the current page marked;
  sign-out moves into the header tools; the version stays beside the title.
  Banners render as notices.
- **Theme.** Light/dark follows the OS until the viewer picks one; the choice is
  remembered in the browser and applied before first paint.
- **Language picker.** A viewer can choose English or Español; the choice is
  stored in a cookie that overrides `Accept-Language` on the sign-in pages and the
  browser's languages in the app, and switching re-renders without a reload.
- **Dashboard becomes an overview.** Hero: transactions imported in the last 30
  days (counting up once), with 7/60/90-day pills, and the next scheduled sync
  on the side. Metric cards: connections (with relink alert), budgets/profiles,
  accounts routed (coverage meter), run success rate. Panels: imports per day
  (30-day column chart), imports by connection (bar list), and per-connection
  sync status rows (freshness, last, next).
- **Connections show health.** Each connection is a panel with a status chip,
  "synced N ago" freshness, a rate-limit meter (pulls used of the ceiling in the
  window, when a ceiling is set), and account rows that show which budgets each
  account feeds and how many transactions it imported in 30 days.
- **Profiles show routing.** Each profile panel shows a coverage meter (routed /
  syncable accounts) and renders mappings as routing rows: bank account → Actual
  account select, with the pending toggle.
- **Schedules show the week.** A seven-day strip of upcoming scheduled runs above
  the schedule rows.
- **History shows trends.** Metric cards for the last 30 days (runs, success
  rate, imported, failures), a 90-day imports column chart, and runs as calm
  expandable rows instead of a nested table.
- **Connection-health banners on every page.** When a budget's most recent sync
  couldn't reach Actual, when its most recent sync hit import errors, or when a
  bank needs reconnecting, every signed-in page shows a notice naming the budget
  or bank, saying what's wrong, and linking to the fix. Banners clear on their own
  once a later sync succeeds (or the bank is relinked). Dismissing hides only that
  incident; a new failure brings the banner back. Built from stored sync results,
  so pages make no live Plaid or Actual calls to show them.
- **Settings, login, register, forms** restyled into panels and the shared form
  styles. Profile and schedule forms keep their dedicated pages, now inside the
  app. No setting changes meaning.

No sync, scheduler, Plaid, Actual, or session behavior changes; no DB
migrations. The HTML form-post endpoints for profiles, schedules, and settings
are replaced by JSON endpoints (**BREAKING** for anything scripting those form
posts; nothing in the repo does).

## Capabilities

### New Capabilities
- `visual-design-system`: the shared look and interaction rules every page uses:
  tokens and themes, typography, shell (header tools + tab strip), page and panel
  scaffolding, data marks (hero figure, metric, bar list, column chart, meter,
  chip), calm row lists, notices, motion that honors reduced-motion, and
  accessibility rules for charts.
- `sync-insights`: the derived figures the pages show: daily import series in
  the viewer's time zone, imports by connection and by account, run outcome
  rates, connection freshness, per-connection rate-limit usage, mapping coverage,
  and the next seven days of scheduled runs. Read-only and local-only.

### Modified Capabilities
- `app-navigation`: the nav becomes a tab strip with an active state and header
  tools; signed-in pages are one client app that switches pages and applies
  actions without full reloads; the dashboard's required content changes (hero
  figure, coverage and success metrics, imports-per-day and by-connection panels,
  sync status rows).
- `auth`: unauthenticated requests to `/api/*` receive `401` JSON rather than a
  redirect to the login page; the allowlist itself is unchanged.
- `i18n`: locale resolution gains an explicit viewer choice (cookie) that
  takes precedence over `Accept-Language` / the browser's languages.
- `sync-history`: the history view adds 30-day summary metrics and a 90-day
  imports chart, and presents runs as expandable rows.
- `app-notifications`: adds connection-health banners (Actual unreachable,
  import errors, bank needs relink), derived from local state, auto-clearing,
  dismissable per incident.
- `account-mapping`: the "aligned columns" requirement becomes routing rows
  (bank account → Actual account) with a per-profile coverage meter.

## Impact

- **New frontend** `web/`: Vite config (base `/static/app/`), `index.html`,
  React app (shell, router over the History API, theme, i18n provider reading the
  shared catalog), components ported from Media Insights (`PageIntro`, `Panel`,
  `Notice`, `HeroNumber`, `BarList`) plus `ColumnChart`, `Meter`, `Chip`, and a
  Plaid Link hook; one page module per surface.
- **Server**: `src/api/` view-model builders (moved out of the page routes) and
  JSON routes; SPA shell route for every page URL; auth gate returns `401` for
  `/api/*`. Page-rendering routes and their Eta templates are removed, except the
  sign-in pages and the shared `layout.eta` they use.
- **Styles/assets**: `public/style.css` (Media Insights tokens and classes) and
  vendored `public/fonts/`; Font Awesome and `public/app.js` go away (icons come
  from `react-icons`; sign-in pages use two inline SVGs).
- **New module**: `src/insights/` (pure functions + tests); new read-only queries
  in `src/db/queries.ts`.
- **i18n**: one catalog (`src/i18n`) used by the server pages and imported by the
  app; new `shell.*`, `theme.*`, `lang.*`, `insights.*`, `health.*` keys.
- **Dependencies** (dev, bundled at build): `react`, `react-dom`, `motion`,
  `react-icons`, `vite`, `@vitejs/plugin-react`, `@types/react`,
  `@types/react-dom`. No new runtime server dependency.
- **Build/deploy**: `npm run build` also runs `vite build`; the Dockerfile copies
  `web/`; dev runs Vite (proxying to Fastify) beside `tsx watch`.
- **Docs**: `README.md` refreshed at archive, with new screenshots.
