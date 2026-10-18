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

## What Changes

- **Adopt the Media Insights design system.** New token-based stylesheet
  (light + dark), self-hosted Playfair Display / DM Sans / DM Mono, panels,
  page intros (eyebrow, title, one-line lede), hero card, metric grid, bar
  lists, column chart, meters, chips, notices, segmented controls, calm row
  lists with icon actions on hover/focus. Mobile first, flexbox, solid colors.
  `public/style.css` is replaced wholesale.
- **New app shell.** Title row with a theme toggle and a language picker; the
  primary pages become an underlined tab strip with the current page marked;
  sign-out moves into the header tools; the version stays beside the title.
  Banners render as notices.
- **Theme.** Light/dark follows the OS until the viewer picks one; the choice is
  remembered in the browser and applied before first paint.
- **Language picker.** A viewer can choose English or Español; the choice is
  stored in a cookie and overrides `Accept-Language`.
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
  styles. No setting changes meaning.

No sync, scheduler, Plaid, Actual, or auth behavior changes. No API contract
changes. One read-only aggregate query set is added; no DB migrations.

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
  tools; the dashboard's required content changes (hero figure, coverage and
  success metrics, imports-per-day and by-connection panels, sync status rows).
- `i18n`: locale resolution gains an explicit viewer choice (cookie) that
  takes precedence over `Accept-Language`.
- `sync-history`: the history view adds 30-day summary metrics and a 90-day
  imports chart, and presents runs as expandable rows.
- `app-notifications`: adds connection-health banners (Actual unreachable,
  import errors, bank needs relink), derived from local state, auto-clearing,
  dismissable per incident.
- `account-mapping`: the "aligned columns" requirement becomes routing rows
  (bank account → Actual account) with a per-profile coverage meter.

## Impact

- **Styles/assets**: `public/style.css` rewritten; `public/fonts/` (woff2 + OFL
  licenses); small `public/app.js` for theme, language, relative times, count-up,
  and row disclosure, shared by all pages.
- **Views**: every `.eta` file restyled; `layout.eta` rebuilt; new partials for
  page intro, metric, bar list, column chart, meter.
- **Routes**: `home.ts`, `history.ts`, `schedules.ts` pass insight data;
  `render.ts` reads the language and time-zone cookies and builds the
  health banners alongside the existing named banners.
- **New module**: `src/insights/` (pure functions + tests); new read-only queries
  in `src/db/queries.ts`.
- **i18n**: new `shell.*`, `theme.*`, `lang.*`, `insights.*` keys in `en` + `es`;
  existing keys kept where the wording still fits.
- **Dependencies**: none added at runtime (fonts are vendored files; Font Awesome
  stays, per the non-React icon rule).
- **Docs**: `README.md` refreshed at archive.
