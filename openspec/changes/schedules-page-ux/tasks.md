## 1. i18n catalogs

- [x] 1.1 Add `schedules.statusActive` / `schedules.statusPaused` to `src/i18n/en.ts` and `src/i18n/es.ts`
- [x] 1.2 Add/confirm catalog parity test passes (`src/i18n/i18n.test.ts`)

## 2. Dedicated creation page

- [x] 2.1 Add `GET /schedules/new` in `src/routes/schedules.ts` rendering a new `schedules_new` view with the owner's connections
- [x] 2.2 Create `src/views/schedules_new.eta` reusing `partials/schedules_form` and posting to `POST /schedules` (mirror `schedules_edit.eta`)
- [x] 2.3 Confirm `POST /schedules` is unchanged and still redirects to `/schedules`

## 3. List page header + create button

- [ ] 3.1 Replace the inline "New schedule" form card in `src/views/schedules.eta` with a header (reusing `.profiles-header`) containing title, description, and a "New schedule" button linking to `/schedules/new`
- [ ] 3.2 When the owner has zero connections, show the `schedules.needConnections` guidance in the header instead of the button

## 4. Visual status + icon toggle

- [ ] 4.1 In `src/views/schedules.eta`, replace inline `enabled ·/disabled ·` text with a status badge (`schedules.statusActive` / `schedules.statusPaused`) per non-legacy row
- [ ] 4.2 Apply an `is-disabled` modifier on disabled rows' `.list-row`
- [ ] 4.3 Convert the Enable/Disable submit button to an `.icon-btn` using `fa-toggle-on`/`fa-toggle-off` with `aria-label`/`title` from `schedules.disable`/`schedules.enable`
- [ ] 4.4 Add `.badge-active`, `.badge-paused`, and `.list-row.is-disabled` styles to `public/style.css` (solid colors; reuse `.badge` base)

## 5. Verify

- [ ] 5.1 Run `npm test` in the dev container and confirm green
- [ ] 5.2 Manually verify: list shows badges/dimmed rows, header button opens `/schedules/new`, create + toggle still work, zero-connection state shows guidance
- [ ] 5.3 Per-change `mental-model.html` delta created/updated for this change
