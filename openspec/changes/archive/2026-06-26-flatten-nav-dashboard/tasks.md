## 1. i18n catalogs

- [x] 1.1 In `src/i18n/en.ts` and `src/i18n/es.ts`, replace `nav.home` with `nav.connections` and `nav.profiles`
- [x] 1.2 Add a `dashboard.*` namespace (en + es): page title, the four card labels (connections, profiles, last sync, next sync), the relink-needed alert, the admin other-users label, and per-card empty states (no connections / no profiles / never synced / no schedules / no other users)
- [x] 1.3 Confirm catalog parity test passes (`src/i18n/i18n.test.ts`)

## 2. Split the combined view into two pages

- [x] 2.1 Create `src/views/connections.eta` from the `data-panel="connections"` section of `home.eta`, including only the connections JS (link, sync selected/all, remove, account-remove, manage-accounts, relink); drop the tab buttons and tab-activation script
- [x] 2.2 Create `src/views/profiles.eta` from the `data-panel="profiles"` section of `home.eta`, including only the profiles JS (mapping-select, pending-visible, profile-delete); drop the tab buttons and tab-activation script
- [x] 2.3 Delete `src/views/home.eta` once both panels are migrated

## 3. Routes

- [x] 3.1 Add `GET /connections` (in `home.ts` or a new `connections.ts`) building only `itemViews`; render `connections.eta`. No per-profile Actual fetch
- [x] 3.2 Add `GET /profiles` index handler building `profileViews` (keep the `listAccountsForProfile` fetch); render `profiles.eta`. Verify no collision with existing `profiles.ts` routes
- [x] 3.3 Keep `toHomeAccount` / `accountsForItem` shared between the two handlers

## 4. Dashboard at `/`

- [x] 4.1 Repurpose `GET /` to render a new `src/views/dashboard.eta`, passing only locally-derived summary data
- [x] 4.2 Compute: connection count + relink-needed count (`plaidItems.listByOwner`), profile count (`profiles.listByOwner`), most-recent `last_synced_at`, and minimum `next_run_at` among `enabled` schedules (`schedules.listByOwner`). Make no Plaid or Actual calls
- [x] 4.3 Render four linked, read-only status cards (→ `/connections`, `/profiles`, `/history`, `/schedules`) with empty-state fallbacks; surface the relink alert when any connection needs relinking
- [x] 4.4 For admins only (`currentUser(req)?.role === "admin"`), compute `users.count() - 1` and render an other-users card; omit it for members and show an empty state when the admin is the sole user

## 5. Nav + styles

- [x] 5.1 Update `layout.eta` nav: add Connections + Profiles links, remove the Home link; order Connections · Profiles · Schedules · History · [Settings] · Logout
- [x] 5.2 Add dashboard status-card styles to `public/style.css` (solid colors, mobile-first, flex layout)
- [x] 5.3 Remove the now-unused `.tabs` / `.tab-btn` / `.tab-panel` styles after grepping for other references

## 6. Verify

- [x] 6.1 Run `npm test` in the dev container and confirm green
- [x] 6.2 Manually verify: `/` shows the dashboard with correct counts/alerts and links navigate correctly; `/connections` and `/profiles` render and all their actions (link, sync, mapping, delete, relink) still work; nav reflects the flat structure
- [x] 6.3 Create/update the per-change `mental-model.html` delta
