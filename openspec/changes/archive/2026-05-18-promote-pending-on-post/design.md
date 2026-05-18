## Context

Plaid's `/transactions/sync` represents a pending-to-posted transition as two events in the same delta:
- A `removed` entry with the pending `transaction_id`
- An `added` entry whose `pending_transaction_id` field points back to that pending id, with a new posted `transaction_id`

Today's importer processes these independently: the pending row is hard-deleted (via `processRemovals` in `src/sync/lifecycle.ts`), and the posted row is inserted as a brand-new transaction (via `importBatch` / `api.importTransactions`). Any user-applied category, notes, payee renames, or split children on the pending row vanish on every posting event.

A spike against a live Actual instance (see `scripts/spike-pending-update.ts`, ran in /opsx:explore for this change) confirmed that `api.updateTransaction` can perform the promotion in place while preserving user edits, and surfaced three implementation-relevant quirks that this design captures.

## Goals / Non-Goals

**Goals:**
- Preserve user edits (category, notes, payee, splits) when a pending transaction posts.
- Reuse the existing per-account `imported_id` lookup map already built for removals — no extra `getTransactions` calls.
- Keep the existing delete-on-removed path intact for removals that aren't part of a promotion.
- Be safe when the pending row isn't in Actual (e.g., `pending_visible=false`, user deleted it): fall through to the existing insert path.

**Non-Goals:**
- Auto-rebalancing split children when the posted amount differs from the pending amount. Actual's native `SplitTransactionError` UI badge is the resolution surface.
- Updating the resolved `payee` id on promotion. The user's payee on the pending row is preserved; only `imported_payee` (audit trail) is touched.
- Robust per-promotion error capture. `api.updateTransaction` is fire-and-forget; we accept best-effort error visibility and rely on the existing `withActual` flow to flush.
- Migrating any existing data. Rows already lost to today's delete-and-insert behavior stay lost; this change only affects future promotions.

## Decisions

### Bucket promotions in `run.ts` during delta processing

The delta loop in `src/sync/run.ts` already partitions txns into `pulled` (for `importBatch`) and `removalsByActualAccount` (for `processRemovals`). Add a third bucket — `promotionsByActualAccount` — populated when an `added` or `modified` Plaid txn has `pending_transaction_id` set. When bucketed as a promotion:
- The added/modified txn is **excluded** from the imports bucket (we don't insert it; we update an existing row).
- The paired `removed` entry (matched by `removed.transaction_id === added.pending_transaction_id`) is **excluded** from the removals bucket (we don't delete the row we're about to promote).

**Alternatives considered:**
- *Detect promotions inside `processRemovals`*: rejected because by then we've lost the link to the `added` row that carries the new `imported_id`, `amount`, etc.
- *Always pass both buckets and let the lifecycle layer resolve*: rejected as it spreads the pairing logic across modules and complicates testing.

### Reuse the existing `imported_id` lookup map

`processRemovals` already calls `buildImportedIdMap(api, actualAccountId)` to build a `Map<imported_id, ActualRowEntry>` over a ±30-day window. Promotions need the same map (looking up `pending_transaction_id`). Build it once per Actual account per run, pass it to both `processPromotions` and `processRemovals`. Hoist `buildImportedIdMap` invocation out of `processRemovals` into the caller so it can be shared.

**Trade-off:** if an account has only promotions (no removals) the lookup is still built — a cost we already pay if any removals exist. The alternative (lazy build per consumer) doubles the API call cost in the common case.

### Don't touch `payee` or `payee_name` on update

The spike showed `api.updateTransaction` rejects `payee_name` with `Field "payee_name" does not exist on table transactions` (it's an import-only convenience field). The lower-level `payee` (resolved id) IS accepted, but updating it would clobber any user-applied payee rename.

We update `imported_id`, `amount`, `cleared: true`, `date`, and `imported_payee` only. The user's resolved `payee` is left alone — preserving renames is consistent with the broader goal of this change.

**Alternative considered:** resolve the posted txn's payee name to an id via `getPayees`/`createPayee`, then pass `payee`. Rejected — extra API calls per promotion, and clobbers user intent.

### Let split-amount mismatches surface as `SplitTransactionError`

When a pending split (e.g., parent -$20 split into two -$10 children) posts with a different amount (e.g., -$24), the spike showed `updateTransaction` updates the parent's `amount` to -$24 and sets `parent.error = { type: 'SplitTransactionError', version: 1, difference: -400 }`. Children are untouched. Actual's UI surfaces this as a badge the user reconciles manually.

This is the **same UX as Actual's own split-import flow** (per the comment in `node_modules/@actual-app/core/@types/src/types/models/import-transaction.d.ts`: *"If amounts don't equal total amount, API call will succeed but error will show in app"*).

**Alternatives considered:**
- *Append an "adjustment" subtransaction for the difference*: rejected. We'd need to invent a category/notes for the synthetic child; the user didn't ask for it; and it's not clear which split row "owns" the variance.
- *Skip `amount` on update for split parents (update only metadata)*: rejected. Leaves a misleading stale parent amount with no visible signal that anything's off.
- *Fall back to delete-and-insert for splits with amount changes*: rejected. Strictly worse than the SplitTransactionError path (loses all child rows + categorization).

### Accept `cleared: true` cascading to children

The spike showed that setting `cleared: true` on a split parent cascades to all child rows (they also flip to `cleared: true`). This matches the semantics — the pending posted, so its constituent parts also posted. No special handling required.

### Live with `api.updateTransaction` being fire-and-forget

`@actual-app/api/dist/index.js` line 113167 calls `handlers$1["transactions-batch-update"](diff)["updated"]` without `await`. The handler returns `undefined` immediately; the DB writes complete in a background microtask; errors surface as unhandled promise rejections, not thrown errors the caller can `try/catch`.

Mitigations:
- The existing `withActual` wrapper calls `actual.sync()` after the user-supplied function returns. That sync forces a flush, so the writes complete before the run ends. No code change needed.
- For per-promotion error capture: best-effort only. We log structured attempts (account, plaid pending id, plaid posted id) and rely on the `sync_orphan_deletes` table semantics for cases where the lookup misses. We do **not** wrap individual `updateTransaction` calls in `try/catch` expecting to catch promotion failures — that wouldn't work.

**Alternative considered:** Use a lower-level batched API (`batchUpdateTransactions`) that IS awaited. Rejected — it's not exported from `@actual-app/api`, and we'd take on a private-API dependency for marginal improvement.

### Handle the fall-through cases inline in `processPromotions`

If the promotion lookup misses (pending row not in Actual — either because `pending_visible=false` so we never imported it, or because the user manually deleted it), `processPromotions` re-routes that one promotion back into the imports bucket as a fresh insert. This preserves today's behavior for users who don't import pending rows.

`processPromotions` returns the list of promotions that fell through to insert. The caller appends them to the imports for that Actual account before calling `importBatch`.

## Risks / Trade-offs

- **[Risk]** `api.updateTransaction` fire-and-forget could mask errors → **Mitigation**: rely on `withActual`'s terminal `sync()` flush; log promotion attempts with structured fields so any errors that surface as unhandled rejections at process level can be correlated; accept that per-promotion failure observability is degraded relative to imports/removals.

- **[Risk]** A `removed` entry arrives in a later sync delta without its paired `added` (Plaid splits the transition across cursor pages) → **Mitigation**: not catastrophic. We promote eagerly on the `added` we see, so the row's `imported_id` is now the posted id. The later orphan `removed` (carrying the pending id) won't find a match in `buildImportedIdMap` and becomes today's "no matching Actual txn" warning at `src/sync/lifecycle.ts:111`. This is a false alarm; we accept it rather than tracking recently-promoted ids across runs.

- **[Risk]** User has reconciled the pending row before it posts → **Mitigation**: `updateTransaction` may fail (the spike didn't cover this case). Failure surfaces as an unhandled rejection per the fire-and-forget quirk; the row remains in reconciled-pending state. Acceptable edge case — reconciling a pending row is unusual.

- **[Trade-off]** Split-amount mismatches leave the user a manual reconciliation task → consciously chosen over auto-rebalancing (see Decisions). The alternative path (today's delete-and-insert) loses the splits entirely, which is worse.

- **[Trade-off]** We don't update the resolved `payee` on promotion → if a user *wants* the posted transaction's payee to override their pending edit, they have to do it manually. Acceptable; the inverse (clobbering user renames) is worse.
