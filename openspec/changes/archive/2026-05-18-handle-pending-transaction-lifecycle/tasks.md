## 1. Schema migration

- [x] 1.1 Create `src/db/migrations/0002_pending_lifecycle.sql` adding `pending_visible INTEGER NOT NULL DEFAULT 0` to `account_mappings` and creating the `sync_orphan_deletes` table with `idx_orphan_unack` partial index per design.md
- [x] 1.2 Verify migration runs cleanly via `npm run migrate` against an existing dev `data/` SQLite file (existing mappings should get `pending_visible=0`)

## 2. Data layer (`src/db/queries.ts`)

- [x] 2.1 Add `pending_visible` to the `AccountMappingRow` type and the mapping SELECT statements
- [x] 2.2 Update `accountMappings.upsert` (or the equivalent existing write) so that changing `actual_account_id` does NOT reset `pending_visible` — preserve current value if present
- [x] 2.3 Add `accountMappings.setPendingVisible(plaidAccountId, value)` query
- [x] 2.4 Add a `syncOrphanDeletes` query namespace with: `insert`, `listUnacknowledged()`, `getById(id)`, `ack(id)` (sets `acknowledged_at = datetime('now')` only if currently NULL), `countUnacknowledged()`

## 3. Sync engine — filter pending (`src/sync/run.ts`)

- [x] 3.1 After `syncItem` returns, when iterating `delta.added` and `delta.modified` to pull per-account, look up the target's `mapping.pending_visible`; if `false`, exclude transactions where `pending === true`
- [x] 3.2 Add a unit test covering: pending excluded when `pending_visible=false`; pending included as `cleared=false` when `pending_visible=true`; non-pending always included → covered by `shouldImportTxn` tests in `src/sync/lifecycle.test.ts`

## 4. Sync engine — consume `delta.removed`

- [x] 4.1 Extend `runSync` (or add a helper) so that for each item with non-empty `delta.removed`, removals are grouped by target Actual account using the in-memory mapping
- [x] 4.2 Inside the `withActual` block, for each affected Actual account, call `api.getTransactions(actualAccountId, today−30d, today+30d)` once and build a `Map<imported_id, actual_id>`, skipping rows where `imported_id` is undefined
- [x] 4.3 For each removed Plaid `transaction_id`: if found in the map, call `api.deleteTransaction(actualId)`; if not found, call `request.log.warn({ plaidTxnId, plaidAccountId, plaidItemId }, 'remove: no matching Actual txn')` (use the run's pino logger; thread it down if needed)
- [x] 4.4 Wrap each `deleteTransaction` in try/catch; on throw, capture the original Plaid txn metadata (payee, amount, date) — fetched from the removed event AND/OR from the resolved Actual row before delete — and insert a `sync_orphan_deletes` row referencing the current `sync_run_id`
- [x] 4.5 Removals must not abort the rest of the run; an item with only removals (no added/modified) MUST still update its cursor
- [x] 4.6 Confirm split-transaction parents are handled: if a resolved Actual id refers to a split parent, `deleteTransaction` is expected to cascade — verify in dev or note as orphan-worthy if it throws

## 5. Routes

- [x] 5.1 Add `POST /accounts/:plaidAccountId/mapping/pending-visible` in `src/routes/accounts.ts`: validate `{ value: boolean }` via zod, 404 if no mapping row, otherwise call `accountMappings.setPendingVisible` and return JSON `{ ok, pendingVisible }` (the home view re-renders client-side via inline JS, matching the existing fetch-based pattern in `home.eta`)
- [x] 5.2 Add `POST /history/orphans/:id/ack` in `src/routes/history.ts`: 404 if unknown or already-acked, otherwise call `syncOrphanDeletes.ack` and return the updated banner partial HTML (empty string when no unacked rows remain)

## 6. Views

- [x] 6.1 In `src/views/home.eta` (or the relevant mapping partial), add the pending-visible toggle next to the mapping dropdown for mapped accounts only; bind to `POST /accounts/:plaidAccountId/mapping/pending-visible`; render as a checkbox with `title=` tooltip text per design.md
- [x] 6.2 Tooltip copy (terse):
  - Off: "Wait for transactions to post before importing. Avoids duplicates from amount changes (tips, gas pre-auths). 1–3 day delay vs. live."
  - On: "Import pending transactions as uncleared. When they post, the pending entry is deleted and replaced. Manual edits to pending entries are lost."
- [x] 6.3 Create `src/views/partials/orphan_banner.eta` rendering the yellow banner with count + expandable list; each row has an "I deleted it" ack button that fetch-POSTs to `/history/orphans/:id/ack` and swaps the banner host container with the response body (vanilla JS in `history.eta`, matching the codebase pattern — no HTMX dep)
- [x] 6.4 Include the banner partial in `src/views/history.eta` above the run list, fed by `syncOrphanDeletes.listUnacknowledged()` from the `/history` route handler

## 7. Tests

- [x] 7.1 Unit test: `pending_visible=false` filters pending from added and modified before mapping → covered by `shouldImportTxn` tests in `src/sync/lifecycle.test.ts`
- [x] 7.2 Unit test: removal resolution builds the map correctly from a sample `getTransactions` response, including skipping rows with undefined `imported_id` → `buildImportedIdMapFromTxns` test
- [x] 7.3 Unit test: failed `deleteTransaction` inserts a `sync_orphan_deletes` row with the expected fields; missing-in-map removal emits the structured warn and does NOT insert → both `processRemovals` tests
- [x] 7.4 Unit test: `accountMappings.upsert` preserves `pending_visible` when only `actual_account_id` changes → in `src/db/queries.test.ts`
- [ ] 7.5 Manual sandbox smoke: link a Plaid sandbox account, force a pending transaction to post, confirm pending_visible=true imports uncleared then deletes on post, and pending_visible=false skips pending entirely. **Deferred — requires a live Plaid sandbox + running Actual server.**

## 8. Documentation

- [x] 8.1 Update `README.md` "First-run walkthrough" with a note about the pending-visible toggle (one sentence)
- [x] 8.2 Update `README.md` troubleshooting table with a row for the orphan banner ("Yellow banner on history page" → "A delete to Actual failed; click 'I deleted it' after manually removing the listed transactions in Actual.")
