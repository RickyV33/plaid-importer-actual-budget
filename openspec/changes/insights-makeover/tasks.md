## 1. Insights core (pure, tested first)

- [x] 1.1 Create `src/insights/` with pure functions: `dailySeries`, `byConnection`, `outcomeSummary`, `freshness`, `rateLimitUsage`, `coverage`, `upcomingWeek` (reusing `nextOccurrence`), plus `safeTimeZone`
- [x] 1.2 Unit tests for each in `src/insights/insights.test.ts`
- [x] 1.3 Read-only, owner-scoped queries: runs since a time; imported by connection / by account since a time; tests in `src/db/queries.test.ts`

## 2. Locale cookie

- [x] 2.1 `resolveLocale` takes the `lang` cookie (supported wins; unsupported ignored); `render.ts` passes it; tests
- [x] 2.2 `shell.*`, `theme.*`, `lang.*` keys (en + es)

## 3. Design system foundation

- [x] 3.1 Vendor latin woff2 for DM Sans 400–700, DM Mono 400/500, Playfair Display 600/700 into `public/fonts/` with OFL licenses
- [x] 3.2 Rewrite `public/style.css` from Media Insights' tokens and classes, plus column chart, chip, routing row, week strip, disclosure rows, switch
- [x] 3.3 Restyle `login.eta` / `register.eta` as centered panels on the new `layout.eta`

> Superseded by the React port (landed in Eta, removed in group 10): `public/app.js`,
> the Eta shell's tab strip and banners, partials `bar_list` / `column_chart` /
> `meter` / `freshness_chip`, `src/views/format.ts` and `nav.ts`, and the Eta
> Overview and Connections pages.

## 4. Connection-health banners

- [x] 4.1 Owner-scoped query: result rows of the latest run per profile; tests
- [x] 4.2 Pure `src/insights/health.ts` incidents with per-incident keys; tests
- [x] 4.3 Health banners on every page, ahead of named banners, dismissable per incident; route tests
- [ ] 4.4 Manually verify against Plaid sandbox: point a profile at an unreachable server, sync, see the banner on every page, dismiss it, sync again (banner returns), fix the server, sync (banner clears)

## 5. Server: JSON API

- [x] 5.1 Auth gate: protected `/api/*` without a session → `401 { error: "unauthenticated" }`; other paths still redirect; extend `src/routes/auth.gate.test.ts`
- [x] 5.2 Move page view-model building out of `home.ts` / `history.ts` / `schedules.ts` / `settings.ts` into `src/api/*.ts` (`overviewFor`, `connectionsFor`, `profilesFor`, `schedulesFor`, `historyFor`, `settingsFor`, `bannersFor`, `meFor`) with exported return types; `tz` from a query param via `safeTimeZone`
- [x] 5.3 `src/routes/api.ts`: `GET /api/me`, `/api/banners`, `/api/overview`, `/api/connections`, `/api/profiles`, `/api/profiles/:id`, `/api/schedules`, `/api/schedules/:id`, `/api/history`, `/api/settings` (admin); tests for owner scoping, admin gate, and the history summary being independent of paging
- [x] 5.4 JSON writes replacing the form posts, same validation and error keys: `POST /api/profiles`, `PUT /api/profiles/:id`, `POST /api/schedules`, `PUT /api/schedules/:id`, `POST /api/schedules/:id/toggle`, `PUT /api/settings/{registration-secret,sync-limit,initial-history}`; move `settings.initial-history.test.ts` and `health-banners.test.ts` onto the API
- [x] 5.5 App shell route: every page URL (one shared route table, tested) returns the app's `index.html` behind the auth gate; in dev (`VITE_DEV_SERVER`) the shell loads modules from Vite

## 6. Frontend scaffold

- [x] 6.1 Add dev deps (`react`, `react-dom`, `motion`, `react-icons`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`); `web/` with `index.html` (pre-paint theme script, `/static/style.css`), `vite.config.ts` (`base: /static/app/`, out `dist/web`), `tsconfig.json`; scripts `dev:web`, `build` (tsc + vite build), `typecheck`; tests keep `node --test` and include `web/src/**/*.test.ts`
- [ ] 6.2 `web/src/router.ts` (pure path matching, tested) + `useRoute` on `popstate` and link interception; `api.ts` typed client (adds `tz`, sends `401` to `/login?next=`, maps `{ error }` to messages)
- [ ] 6.3 `theme.ts` (`pi-theme`), i18n provider over `src/i18n` catalogs (`lang` cookie ▸ `navigator.languages` ▸ en; switch without reload; tested pure helpers), `format.ts` (number, percent, day keys, times; tested)
- [ ] 6.4 Shell: header (title, version, theme pill, language select, sign-out form), tab strip with `aria-current`, banners from `/api/banners` with dismiss, page transition
- [ ] 6.5 Components: `PageIntro`, `Panel`, `SectionHead`, `Notice`, `HeroNumber`, `BarList` (ported), `ColumnChart`, `Meter`, `FreshnessChip`, `Row`, `ConfirmButton`, `EmptyState`
- [ ] 6.6 `plaid.ts`: load Plaid's script once; `openLink(token, handlers)`
- [ ] 6.7 Build + deploy: Dockerfile copies `web/` and builds it; Fastify serves `dist/web` at `/static/app/`; `.vscode/tasks.json` runs Fastify + Vite together

## 7. Pages

- [ ] 7.1 Overview
- [ ] 7.2 Connections: sync selected/all with per-bank results as notices, link, relink, manage accounts, remove bank, remove deselected account; refetch instead of reload
- [ ] 7.3 OAuth return page at `/link/oauth-return` (re-open Link with the stored token and `receivedRedirectUri`)
- [ ] 7.4 Profiles: panels with coverage meter, routing rows saving in place (mapping select, pending switch), delete
- [ ] 7.5 Profile create/edit pages with the budget loader and manual budget entry
- [ ] 7.6 Schedules: week strip, rows with toggle/edit/delete, legacy warning
- [ ] 7.7 Schedule create/edit pages (name, banks, segmented day picker, time, repeat)
- [ ] 7.8 History: 30-day metrics, 90-day chart, expandable runs, pager, orphan notice with acknowledge
- [ ] 7.9 Settings (admin): registration secret with reveal, sync limit, initial history, all-profiles rows with delete

## 8. Strings

- [ ] 8.1 Add page strings (`connections.*`, `profiles.*`, `schedules.*`, `history.*`, `settings.*`, `health.*` client use) in en + es; drop keys no longer used; parity test green

## 9. Screenshots

- [ ] 9.1 Rework `scripts/screenshots.ts`: build the app, serve it with demo API fixtures (from `screenshots.demo.ts`) on a local static server, capture each page with headless Chrome at 1112×813 CSS px, 2× (2224×1626, the size of the current README shots); replace `docs/screenshots/*.png` with one per page (overview, connections, profiles, schedules, history, settings) and update the README `<img>` list (still `width="720"`)

## 10. Cleanup and wrap-up

- [ ] 10.1 Remove superseded Eta pages, partials, `app.js`, server `format.ts`/`nav.ts`, the old page and form-post routes, and Font Awesome; `layout.eta` keeps only what sign-in pages need (inline SVG icons)
- [ ] 10.2 `npm test`, `npm run typecheck`, and `npm run build` in the dev container; check every page at 360px and desktop width, light and dark, and with reduced motion
- [ ] 10.3 Manually verify Plaid Link flows against Plaid sandbox: link, OAuth return, relink, manage accounts, remove
- [ ] 10.4 At archive: refresh `README.md` (stack, dev commands) and archive the change
