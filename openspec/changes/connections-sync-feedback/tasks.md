## 1. Per-connection results from the run

- [ ] 1.1 In `src/sync/run.ts` (or the route), aggregate the run's `sync_account_results` to per-connection (`item_id`) imported sums, including attempted connections that imported 0
- [ ] 1.2 Unit-test the per-connection aggregation in the appropriate test file

## 2. `/sync` response shape

- [ ] 2.1 Extend the `POST /sync` response in `src/routes/sync.ts` to include `synced: [{ itemId, imported, lastSyncedAt }]`
- [ ] 2.2 Add `itemId` to each `skipped[]` entry (keep `name` and `retryAfterMinutes`)
- [ ] 2.3 Keep `status`, `totalImported`, and `runId` unchanged; update/extend route tests

## 3. i18n

- [ ] 3.1 Add keys for the per-connection imported-count message and the dismiss control to `src/i18n/en.ts` and `src/i18n/es.ts`
- [ ] 3.2 Confirm catalog parity test passes (`src/i18n/i18n.test.ts`)

## 4. Connections page UX

- [ ] 4.1 In `src/views/connections.eta`, render each synced connection's imported count and each skipped connection's retry message on that connection's card, each with a close control
- [ ] 4.2 Remove `setTimeout(() => window.location.reload(), 1800)`; update each card's last-sync line in place from `synced[].lastSyncedAt`
- [ ] 4.3 Keep the overall imported total below the sync buttons, also dismissible
- [ ] 4.4 Add a 60-second auto-clear fallback for the result/skip messages
- [ ] 4.5 Add styles to `public/style.css` for the per-connection message + close button (reuse result/warn patterns, solid colors)

## 5. Verify

- [ ] 5.1 Run `npm test` in the dev container and confirm green
- [ ] 5.2 Manually verify: per-connection counts appear and persist; skip message stays on the right connection until dismissed; total stays below buttons; no auto-reload; last-sync updates in place; 60s fallback clears messages
- [ ] 5.3 Per-change `mental-model.html` delta created for this change
