## 1. Insights core (pure, tested first)

- [x] 1.1 Create `src/insights/` with pure functions: `dailySeries(runs, days, now, tz)`, `byConnection(results, items)`, `byAccount(results)`, `outcomeSummary(runs)`, `freshness(item, now)`, `rateLimitUsage(pulls, oldest, limit, now)`, `coverage(accounts, mappings)`, `upcomingWeek(schedules, now, tz)` (reusing `nextOccurrence`), plus `safeTimeZone(raw)`
- [x] 1.2 Unit tests for each in `src/insights/*.test.ts`: zero-filled gaps, time-zone bucketing across midnight, invalid zone → UTC, shares, running runs excluded from success rate, no-runs → absent rate, freshness boundaries and relink precedence, at-ceiling free time, deselected accounts excluded from coverage, paused/legacy schedules excluded from the week
- [x] 1.3 Add read-only, owner-scoped queries in `src/db/queries.ts`: runs since a timestamp (`started_at`, `status`, `total_imported`), per-account imported since a timestamp (joined to item); cover owner scoping in `src/db/queries.test.ts`

## 2. Locale cookie

- [x] 2.1 Extend `resolveLocale` with an optional cookie value (supported cookie wins; unsupported ignored); update `render.ts` to pass `req.cookies.lang`; add tests to `src/i18n/i18n.test.ts` for the four spec scenarios
- [x] 2.2 Add `shell.*`, `theme.*`, `lang.*` keys (en + es); keep the parity test green

## 3. Design system foundation

- [x] 3.1 Vendor latin woff2 files for DM Sans 400/500/600/700, DM Mono 400/500, Playfair Display 600/700 into `public/fonts/` with their OFL license files; `@font-face` declarations with `font-display: swap`
- [x] 3.2 Rewrite `public/style.css` from Media Insights' token sheet and class vocabulary (light + dark tokens, OS-dark fallback block, type, shell, tabs, page intro, panel, hero, metric, meter, bar list, notices, buttons, icon buttons, inputs, segmented, row list with hover/focus actions and `hover: none` fallback, wider-screen layers); add app pieces: column chart, chip, routing row, week strip, disclosure rows
- [x] 3.3 Add `public/app.js` (deferred, shared): theme toggle with guarded `localStorage`, language select → `lang` cookie + reload, `tz` cookie write, `.rel-ts` relative times via `Intl.RelativeTimeFormat`, `.local-ts` absolute times, hero count-up and fill grow-in gated on reduced motion, generic `[data-disclosure]` row toggling with `aria-expanded`, banner dismiss
- [x] 3.4 Rebuild `layout.eta`: pre-paint theme script in `<head>`, header (title + version | theme pill, language select, sign-out pill), tab strip from a route-provided `nav` value with `aria-current`, banners as notices, no tabs when signed out; every route passes `nav`
- [x] 3.5 Add Eta partials: `page_intro`, `metric`, `bar_list`, `column_chart` (with visually-hidden table), `meter`, `chip`, `empty`
- [x] 3.6 Restyle `login.eta` and `register.eta` into a centered panel; verify sign-in, register, and the auth gate tests still pass

## 4. Connection-health banners

- [ ] 4.1 Add an owner-scoped query returning, per profile, the result rows (status, reason, run id) of the latest run that recorded results for it; test owner scoping and "latest run only" in `src/db/queries.test.ts`
- [ ] 4.2 Add pure `src/insights/health.ts` building incidents (`actual_unreachable`, `import_failed`, `relink`) with per-incident keys; unit tests for each kind, recovery clearing, reason-prefix classification, and key changing with a new run / new relink time
- [ ] 4.3 Wire into `render.ts` ahead of named banners (filtering dismissed keys); render in `layout.eta` as notices with icon, message, fix link, dismiss icon; add `health.*` strings (en + es)
- [ ] 4.4 Manually verify: point a profile at an unreachable server, sync, see the banner on every page, dismiss it, sync again (banner returns), fix the server, sync (banner clears)

## 5. Overview (`/`)

- [ ] 5.1 In `home.ts`, compute overview data via the insights module: 30-day hero + 7/60/90 pills, soonest next sync, connection/relink counts, profile count, coverage, 30-day success rate, 30-day daily series, by-connection list, per-connection freshness/last/next, admin other-users
- [ ] 5.2 Rewrite `dashboard.eta`: page intro, hero card, metric grid, two-col (imports per day | imports by connection), sync status row list; empty states for a fresh account; no create/edit/delete controls
- [ ] 5.3 Add `dashboard.*`/`insights.*` strings (en + es); remove dashboard keys no longer used

## 6. Connections

- [ ] 6.1 In the `/connections` handler, add per-connection freshness, rate-limit usage (when a ceiling is set), and per-account 30-day imported and "feeds N budgets" counts
- [ ] 6.2 Rewrite `connections.eta`: page intro with Sync all / Sync selected / Link bank actions, a panel per connection (status + freshness chips, rate-limit meter), calm account rows with checkbox and hover actions; keep every id/data-attribute the inline script uses (or update the script in step); sync result messages render as notices
- [ ] 6.3 Manually exercise link, sync selected/all, relink, manage accounts, remove connection, remove deselected account in the dev container

## 7. Profiles

- [ ] 7.1 Add per-profile coverage to the `/profiles` handler
- [ ] 7.2 Rewrite `profiles.eta`: page intro with a New profile icon action, a panel per profile (name, host · budget, coverage meter, edit/delete icons on hover), routing rows grouped by connection (account → select → pending switch) aligned on wide screens, stacked on narrow
- [ ] 7.3 Restyle `profile_form.eta` into a panel using the shared form styles; keep the budget loader behavior
- [ ] 7.4 Manually exercise mapping change/clear, pending toggle, create/edit/delete profile, budget loading

## 8. Schedules

- [ ] 8.1 Compute the seven-day upcoming strip in the schedules list handler via `upcomingWeek`
- [ ] 8.2 Rewrite `schedules.eta`: page intro with New schedule icon action, week strip, calm schedule rows (name + chip / recurrence / connections · next) with toggle/edit/delete on hover; legacy rows as warn notices inside the row
- [ ] 8.3 Restyle `schedules_new.eta`, `schedules_edit.eta`, `partials/schedules_form.eta` (day picker as segmented toggles); verify create/edit/toggle/delete

## 9. History

- [ ] 9.1 In `history.ts`, add 30-day outcome summary and 90-day daily series independent of `offset`
- [ ] 9.2 Rewrite `history.eta`: page intro, metric grid, column chart panel, run rows with chips and `[data-disclosure]` drill-down to per-account result rows, pager; orphan banner partial restyled as a warn notice with its acknowledge action
- [ ] 9.3 Add/extend route tests for history summary being independent of paging

## 10. Settings and remaining views

- [ ] 10.1 Rewrite `settings.eta` into panels (registration secret with reveal icon; sync limit and initial history side by side on wide screens); admin profile list as calm rows with a delete icon on hover; keep `settings.initial-history` tests green
- [ ] 10.2 Restyle `oauth_return.eta`; grep views for any class from the old sheet and remove leftovers

## 11. Wrap-up

- [ ] 11.1 Run `npm test` and `npx tsc --noEmit` in the dev container; check every page at 360px and desktop width in light and dark, and with reduced motion
- [ ] 11.2 Update `.vscode/tasks.json` / `launch.json` if any command changed
- [ ] 11.3 Add `scripts/screenshots.ts`: render each page's real template with mocked demo data (no Plaid/Actual), then capture with headless Chrome at 1112×813 CSS px, 2× scale (2224×1626, the size of the current README shots); replace `docs/screenshots/*.png` with one per page (overview, connections, profiles, schedules, history, settings) and update the README `<img>` list (still `width="720"`)
- [ ] 11.4 At archive: refresh `README.md` (with a screenshot of the overview), and archive the change
