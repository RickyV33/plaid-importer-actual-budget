## 1. Count every pull

- [x] 1.1 In `src/sync/run.ts`, after drain + failure recording, record a 0-import marker `sync_account_results` row (representative targeted account, `profile_id` NULL, `reason="pulled"`) for each successfully pulled connection that produced no result row this run
- [x] 1.2 Confirm the marker is skipped for connections that already recorded results (no duplicate) and for errored pulls — extracted `pulledItemsNeedingMarker` helper

## 2. Tests

- [x] 2.1 Unit-test `pulledItemsNeedingMarker` (skips errored + already-recorded; marks no-op pulls) and that a 0-import row still increments `countPullsForItemSince`
- [x] 2.2 Confirm `importedByItemForRun` still sums to 0 for a marker-only connection (no double counting / no inflated totals)

## 3. Verify

- [x] 3.1 Run `npm test` in the dev container and confirm green
- [x] 3.2 Manually verify: with a limit of N, syncing a 0-import connection N times then once more is skipped with a retry hint (user to verify in-app)
- [x] 3.3 Per-change `mental-model.html` delta created for this change
