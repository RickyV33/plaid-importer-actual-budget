## Context

Plaid's `/transactions/sync` delivers pending→posted as `removed[pending_id] + added[posted_id]` (verified at <https://plaid.com/docs/transactions/transactions-data/>: *"the transition from a pending to posted transaction will be represented through the /transactions/sync endpoint with the pending transaction's id in the `removed` field of the response and the new posted transaction in the `added` section"*). The two transactions carry **different** `transaction_id`s; the posted one back-references the pending via `pending_transaction_id`, but that field is not guaranteed (*"If Plaid matches the pending transaction…"*).

The current `src/sync/run.ts` imports `delta.added` and `delta.modified` but discards `delta.removed`. As a result, every pending→posted transition leaves an uncleared duplicate in Actual that the user must manually delete.

Actual's `importTransactions` does not rescue this:
- It calls `reconcileTransactions(..., strictIdChecking=true, ...)` ([node_modules/@actual-app/api/dist/index.js:112483](node_modules/@actual-app/api/dist/index.js:112483)).
- The fuzzy match passes are gated by `(imported_id IS NULL OR ? IS NULL)` ([node_modules/@actual-app/core/src/server/accounts/sync.ts:753](node_modules/@actual-app/core/src/server/accounts/sync.ts:753)).
- When both the existing and incoming rows have `imported_id` (as is always the case here), only Pass 1 (exact `imported_id` match) runs. P1 ≠ P2 → miss → second row inserted.

Independent of dedup, pending amounts are frequently wrong (restaurant tips, gas pre-auths, hotel deposits) and pending transactions sometimes never settle (released holds, merchant cancellations). A user-controllable filter is the simplest way to keep Actual clean of those.

## Goals / Non-Goals

**Goals:**
- Stop emitting duplicates when a pending transaction posts.
- Give the user a per-mapping switch to either see pending-as-uncleared (with auto-cleanup on post) or wait for posted only.
- Make failed deletes recoverable: the user is told exactly which transactions need manual cleanup in Actual and can acknowledge them.
- Default behavior is the conservative one: `pending_visible=false` for new and existing mappings.

**Non-Goals:**
- Backfilling or cleaning up existing duplicates already in Actual from prior syncs (out of scope; user can clean manually one time).
- Sweeping existing pending rows from Actual when the user flips `pending_visible` from on to off (hands-off; toggle affects future syncs only).
- Retrying failed deletes on the next sync run (manual ack is the only resolution; revisit if real-world failures cluster around transient Actual outages).
- A local imported-Plaid-txn tracking table to distinguish "we never imported this" from "this is missing from Actual" (see Open Questions).
- Changing how `delta.modified` is handled. `modified` continues to flow through `importTransactions`, which Pass-1-matches by `imported_id` and updates fields in place — that's the desired behavior for posted-transaction revisions (category, name corrections).

## Decisions

### Per-mapping toggle (not global, not per-Plaid-account)

`account_mappings.pending_visible INTEGER NOT NULL DEFAULT 0` — boolean stored as 0/1. The toggle lives next to the mapping dropdown on the home page.

*Why per-mapping?* A user may reasonably want pending visible on a credit card (fraud spotting) and hidden on a checking account (cleaner ledger). Per-Plaid-account is awkward because the toggle is meaningless before a mapping exists. Global is simplest but doesn't accommodate the credit-vs-checking split.

*Default off* matches the conservative behavior most users want — no surprise duplicates on day 1 of an upgrade, no $1 gas pre-auths cluttering the ledger.

### Lookup strategy for delete: `getTransactions` + in-memory map (no local id cache)

For each Plaid item with a non-empty `delta.removed`:

1. Group removals by mapped Actual account.
2. For each affected Actual account, call `getTransactions(actualAccountId, today−30d, today+30d)` **once**.
3. Build `Map<imported_id, actual_id>` from the response, skipping rows where `imported_id` is undefined (manual entries).
4. For each removed `transaction_id`, look up the map; if found, call `deleteTransaction(actual_id)`.

*Why `getTransactions` over a local map?* The user asked to lean on the Actual API. The typed surface is `getTransactions(accountId, startDate, endDate)` — there's no `imported_id` filter — so client-side filtering is required. `aqlQuery` could push the filter to Actual but is typed `unknown` and is an escape hatch.

*Why ±30 days?* Pending typically settles in 1–3 days; ±30 covers cancelled-then-resurfaced or oddly-dated edge cases with comfortable headroom. A single fetch per affected account per run is cheap; widening to ±90 would be measurable on busy accounts with little benefit.

*Why one fetch per account per run instead of per-removal?* O(removals) Actual round-trips would dominate sync time. One fetch, build the map, then loop deletes.

### Missing-in-Actual → log and continue (no orphan row)

When the in-memory map has no entry for a removed `transaction_id`, the system logs a structured `warn` and continues. No `sync_orphan_deletes` row, no UI surface.

*Why?* With `pending_visible=false`, removed events for never-imported pending transactions are *expected* (cancelled holds). Recording every one would flood the orphan list. With `pending_visible=true`, this path is unexpected; the warning is enough signal to investigate if it shows up. Real prevalence will tell us whether to upgrade to a tracking table (see Open Questions).

### Failed delete → `sync_orphan_deletes` row + history banner + ack

Schema:

```sql
CREATE TABLE sync_orphan_deletes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_run_id INTEGER NOT NULL REFERENCES sync_runs(id),
  plaid_account_id TEXT NOT NULL,
  plaid_transaction_id TEXT NOT NULL,
  payee_name TEXT,
  amount_cents INTEGER,
  date TEXT,
  error_reason TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  acknowledged_at TEXT NULL
);
CREATE INDEX idx_orphan_unack ON sync_orphan_deletes(acknowledged_at) WHERE acknowledged_at IS NULL;
```

UI on `/history`: if any unacknowledged orphan rows exist, render a yellow banner above the run list with a count and a "View" link. The view expands an inline panel listing each orphan with date/amount/payee/reason and an "I deleted it in Actual" button. The ack endpoint (`POST /history/orphans/:id/ack`) sets `acknowledged_at=now()` and re-renders via HTMX.

*Why a dedicated table over folding into `sync_account_results.reason`?* Orphans persist across runs until acknowledged; per-account-result rows are tied to a single run. A separate table keeps the persistent state explicit and the banner query trivial (`SELECT COUNT(*) WHERE acknowledged_at IS NULL`).

### Filter pending after collection, not via Plaid request options

The filter happens in `src/sync/run.ts` after `syncItem` returns, *before* `importBatch` is called, based on the target mapping's `pending_visible` flag. Plaid's `TransactionsSyncRequestOptions` has no pending filter, and even if it did, we'd still need `removed` events for cancelled holds, so server-side filtering wouldn't simplify anything.

The filter applies to both `added` and `modified` for the importable subset (a `pending=true` modification of a previously-imported pending row is also dropped when `pending_visible=false`, matching the intent of "no pending in Actual").

## Risks / Trade-offs

- **Phantom orphan risk during toggle flip**: User has `pending_visible=true`, pending P1 is imported. User toggles to `false`. Plaid later sends `removed: [P1]`. Lookup finds P1 in Actual; delete succeeds. ✓ No issue. Conversely if Plaid sends a stray remove for a Plaid-txn-id we never imported (`pending_visible=false` from the start), lookup returns nothing → log warn → continue. **No orphan row.** → If real-world data shows pending_visible=true users regularly hitting "log warn" cases (i.e., real misses), upgrade to a local tracking table (Patch B from explore notes).

- **Lookup window misses an old pending**: A cancelled pending older than 30 days that Plaid finally reports as removed will quietly log warn and leave its row in Actual. Mitigation: ±30d window covers typical bank behavior; if logs surface this, widen the window or add the local tracking table.

- **Race between fetch and delete**: `getTransactions` returns a snapshot; if the user is editing the budget concurrently, an `actual_id` we resolved could be stale. `deleteTransaction` would error → we record the orphan, the user acks. Self-healing.

- **`deleteTransaction` partial-success behavior on splits**: The current spec doesn't mention split transactions; if Plaid ever sends a removed id that maps to a split parent in Actual, `deleteTransaction(parentId)` should cascade. Verify in `tasks.md`.

- **Manual edits to pending rows are lost on auto-delete**: If `pending_visible=true` and the user adds a note or category to a pending row, that edit disappears when the pending posts and gets deleted. This is unavoidable without per-row "preserve user edits" tracking (out of scope). Tooltip on the toggle calls this out: *"Manual edits to pending entries are lost."*

- **`pending_transaction_id` linkage is best-effort**: For institutions where Plaid can't match pending→posted, the posted txn arrives with `pending_transaction_id=null`, the pending still gets removed (handled), and the posted is added fresh (handled). The two events are independent in our design, so missing linkage is fine.

## Migration Plan

1. Add migration `0002_pending_lifecycle.sql`:
   - `ALTER TABLE account_mappings ADD COLUMN pending_visible INTEGER NOT NULL DEFAULT 0;`
   - `CREATE TABLE sync_orphan_deletes (...);`
   - `CREATE INDEX idx_orphan_unack ...;`
2. Existing mappings receive `pending_visible=0` automatically (column default). No data backfill required.
3. Deploy. First sync after deploy that returns `removed` events will start cleaning up pendings the *correct* way going forward. Pre-existing ghost duplicates in Actual are not touched (out of scope) — the user can clean them once in the Actual UI.

Rollback: revert code; the new column and table can remain (harmless). If schema rollback is required, drop the column and table — no data loss occurs because the feature only adds state.

## Open Questions

- **How often does the "log warn + continue" branch actually fire in production?** This determines whether we need a local imported-Plaid-txn tracking table (Patch B) to distinguish "filtered, never imported" from "should be in Actual, isn't." Plan: ship as designed, watch logs for a few weeks, decide then.
- **Should the orphan ack endpoint require any confirmation?** Currently a single click acks. For a single-user self-hosted app this is fine, but a misclick can hide a real problem until the next sync surfaces it again. Leaving as single-click for v1.
- **Should the history banner show across all pages (e.g., home), not just `/history`?** Current scope is history-only. If failed-delete events are rare in practice, the user might not notice until they happen to visit history. Possible follow-up.
