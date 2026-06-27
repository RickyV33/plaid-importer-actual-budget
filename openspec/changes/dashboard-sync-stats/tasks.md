## 1. Queries

- [ ] 1.1 Add an owner-scoped query in `src/db/queries.ts` summing `sync_runs.total_imported` where `started_at >= cutoff`, returning 0 when none
- [ ] 1.2 Unit-test the windowed-sum query (owner scoping, cutoff boundary, empty → 0) in `src/db/queries.test.ts`

## 2. Dashboard route

- [ ] 2.1 In `src/routes/home.ts`, build a per-connection last/next view: each connection's `last_synced_at` plus the soonest `next_run_at` among the owner's enabled schedules whose `plaid_item_ids` include that connection (null → "no schedule")
- [ ] 2.2 Compute the four windowed totals (7/30/60/90 days from now) via the new query
- [ ] 2.3 Remove the collapsed single `lastSyncedAt`/`nextRunAt` reductions; pass the per-connection list and the totals to the view

## 3. i18n

- [ ] 3.1 Add keys for window labels (7d/30d/60d/90d), "no schedule", imported-totals heading, and per-connection last/next labels to `src/i18n/en.ts` and `src/i18n/es.ts`
- [ ] 3.2 Confirm catalog parity test passes (`src/i18n/i18n.test.ts`)

## 4. View

- [ ] 4.1 In `src/views/dashboard.eta`, replace the two single-value sync cards with a per-connection last/next block (calm empty state when no connections)
- [ ] 4.2 Add the imported-totals card showing the four windowed figures
- [ ] 4.3 Keep all summaries read-only with links to their pages; no create/edit/delete controls, no external calls
- [ ] 4.4 Add styles to `public/style.css` for the per-connection rows and totals figures (reuse card patterns, solid colors)

## 5. Verify

- [ ] 5.1 Run `npm test` in the dev container and confirm green
- [ ] 5.2 Manually verify: two connections show distinct last/next; connection with no schedule shows "no schedule"; windowed totals match history; dashboard stays read-only and makes no Plaid/Actual calls
- [ ] 5.3 Per-change `mental-model.html` delta created for this change
