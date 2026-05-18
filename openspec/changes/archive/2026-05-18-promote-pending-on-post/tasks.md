## 1. Lifecycle layer — promotion detection and application

- [x] 1.1 In `src/sync/lifecycle.ts`, add a `PendingPromotion` type (fields: `plaidPostedTransactionId`, `plaidPendingTransactionId`, `plaidAccountId`, `actualAccountId`, `plaidItemId`, plus the mapped Actual fields: `amount`, `date`, `importedPayee`)
- [x] 1.2 Extend `ActualReadDeleteApi` (or add a sibling type) to include `updateTransaction(id, fields)` so `processPromotions` can be tested with a fake
- [x] 1.3 Hoist `buildImportedIdMap` out of `processRemovals` so it can be built once per Actual account and passed to both promotions and removals (signature change: `processRemovals` accepts an already-built map instead of building its own)
- [x] 1.4 Implement `processPromotions(api, runId, actualAccountId, promotions, importedIdMap, log)` that, for each promotion: looks up the existing Actual row by `imported_id == plaidPendingTransactionId`; on hit, calls `updateTransaction(actualId, { imported_id: plaidPostedTransactionId, amount, cleared: true, date, imported_payee })`; on miss, returns the promotion in a `fellThrough: PendingPromotion[]` list for the caller to re-route into the imports batch
- [x] 1.5 Add a structured log line per promotion attempt with `{ plaidAccountId, plaidPendingId, plaidPostedId, outcome: "updated" | "fell_through" }` — best-effort error visibility per the fire-and-forget quirk

## 2. Run orchestration — bucket promotions in the delta loop

- [x] 2.1 In `src/sync/run.ts`, introduce a `promotionsByActualAccount: Map<string, PendingPromotion[]>` alongside `pulled` and `removalsByActualAccount`
- [x] 2.2 In the per-item delta loop, before populating `pulled`/`removalsByActualAccount`, build a `pendingIdsBeingPromoted: Set<string>` from `delta.added` and `delta.modified` entries whose `pending_transaction_id` is non-null
- [x] 2.3 When collecting added/modified into `pulled`, skip any txn whose `pending_transaction_id` is set — that txn goes into `promotionsByActualAccount` instead (mapped to the target's `actualAccountId`)
- [x] 2.4 When collecting `delta.removed`, skip any entry whose `transaction_id` is in `pendingIdsBeingPromoted` — that entry's paired added is handling the row already
- [x] 2.5 In the `withActual` block, for each Actual account that has either promotions or removals: build the imported_id map once, call `processPromotions` first, append any `fellThrough` promotions back into the imports list for that account, then call `processRemovals` with the same map
- [x] 2.6 Record promotion outcomes in `sync_account_results` consistently with imports (count promotions as part of `txnsImported`, or as a separate field — pick one and document in the implementation PR) — *Implemented: successful promotions add to the matching plaidAccountId's `txnsImported` count alongside imports; fell-through promotions are counted as imports (they go through `importBatch`).*

## 3. Tests

- [x] 3.1 Add unit tests in `src/sync/lifecycle.test.ts` for `processPromotions`: hit case updates the row with the expected fields and excludes payee/payee_name; miss case returns the promotion in `fellThrough` and does not call `updateTransaction`
- [x] 3.2 Add a test that promotion-paired removed entries are filtered out of the deletion list (use the existing `processRemovals` test scaffolding with a fake api) — *Implemented as a `bucketDelta` test; the filtering happens at bucketing time, not in `processRemovals`.*
- [x] 3.3 Add a test that an orphan `added` (with `pending_transaction_id` but no paired `removed` in the same delta) still triggers the promotion path
- [x] 3.4 Add a test that `pending_visible=false` doesn't block promotion when the row happens to exist (covers the "flipped mid-flight" edge case)

## 4. Spec sync

- [ ] 4.1 After implementation lands and the change is ready to archive, run `/opsx:archive` to merge the spec delta into `openspec/specs/transaction-sync/spec.md`
- [ ] 4.2 Verify the archived spec contains the new "Pending transactions are promoted to posted in-place" requirement and the modified "Removed transactions are deleted from Actual" with the promotion-pair carve-out

## 5. Cleanup

- [x] 5.1 Delete `scripts/spike-pending-update.ts` (the spike served its purpose; the conclusions live in `design.md`)
- [ ] 5.2 Delete the three leftover spike test accounts from the live Actual budget: `__spike_pending_update_1779143690231`, `__spike_pending_update_1779144065763`, `__spike_pending_update_1779144478385`
