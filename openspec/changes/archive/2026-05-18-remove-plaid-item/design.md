## Context

The app currently has no way to remove a linked Plaid item. Manual SQLite editing is the only escape hatch, which is awkward and leaves Plaid's side believing the item is still active (meaning the access token continues to count against any paid subscription for the products attached to it).

Plaid's `/item/remove` is the canonical teardown endpoint: it invalidates the access token, dissociates the item from the developer account, and is documented as free of charge. Once we own the wrapper and the route, the UI piece is small.

Two design forks worth thinking through up front:
1. **Hard delete vs. soft delete.** A hard delete on `plaid_items` cascades (via FK) to `plaid_accounts` and `account_mappings`, but `sync_account_results` has no FK and would be left with dangling `plaid_account_id` strings. Today the history view tolerates this (it falls back to the raw id), but the per-run drill-down loses the human-readable account names. The user explicitly chose soft-delete for this reason.
2. **Where to filter `removed`.** The cleanest single chokepoint is `plaidItems.listAll()` — both the home page and the sync orchestrator's `collectTargets()` flow through it. Filtering at that one query covers both surfaces without touching `runSync` or the home route.

## Goals / Non-Goals

**Goals:**

- One-click removal of any linked Plaid item, with a confirm dialog to prevent accidents.
- Plaid's `/item/remove` is always called before the local soft-delete is recorded, so we don't leave items live on Plaid's side while pretending they're gone locally.
- Removed items disappear from the home page and from sync targeting immediately.
- Historical sync runs continue to render correct account names for removed items.

**Non-Goals:**

- Hard-deleting `plaid_accounts`, `account_mappings`, or `sync_account_results` rows. (Deferred: a separate cleanup tool/route could prune them later if we ever care.)
- Undo / restore from `removed` to `active`. If a user re-links the same institution, Plaid will issue a new `item_id`; the previous removed row stays as a tombstone.
- A bulk "remove all" action.
- Surfacing removed items anywhere in the UI for archival viewing. They are simply hidden.

## Decisions

### Decision 1: Soft-delete via a new `removed` status value, no schema migration

`plaid_items.status` is `TEXT NOT NULL DEFAULT 'active'` in `0001_init.sql` — there is no CHECK constraint. So introducing a new value `removed` is purely a TypeScript-side change:

- `PlaidItemRow["status"]` is widened from `"active" | "requires_relink" | "disabled"` to also include `"removed"`.
- `plaidItems.setStatus`'s typed parameter follows.

**Alternative considered:** add a CHECK constraint at the same time. Rejected — it would force a non-trivial migration for no win (the field is only written from one place), and we'd be paying schema-evolution cost on an internal enum.

### Decision 2: Filter `removed` at `plaidItems.listAll()`, not at every callsite

Change `plaidItems.listAll()` to `... WHERE status != 'removed'`. Both surfaces that need to hide removed items (home page and `runSync` via `collectTargets()`) already route through this query, so we get a single chokepoint. Direct `plaidItems.get(id)` calls still return the row regardless of status — the soft-delete shouldn't break the `DELETE /link/items/:itemId` route from finding the item it needs to remove, nor break an idempotent second call.

**Alternative considered:** introducing a separate `listActive()` method and leaving `listAll()` literal. Rejected — every existing caller wants the active-set semantics, and a future caller that genuinely wanted the tombstones can add `listAllIncludingRemoved()` then. Keeping the default behavior aligned with what callers actually want today minimizes the blast radius.

### Decision 3: History resolves account names via the still-intact `plaid_accounts` table

`history.ts` already builds its name map from `plaidAccounts.listAll()` and falls back to the raw `plaid_account_id` when an entry is missing. Because we are not deleting `plaid_accounts` rows, name resolution simply keeps working for removed items' historical runs. No changes needed in the history route or view.

**Alternative considered:** snapshot the account name into `sync_account_results` at write time so history is self-contained. Rejected for this change as unnecessary work — could be revisited if we ever add hard-delete tooling.

### Decision 4: Call `/item/remove` before flipping local status

Order: decrypt access token → `plaid.itemRemove({ access_token })` → on success, `plaidItems.setStatus(id, 'removed')` → 204 to the client. If `/item/remove` fails with anything other than a Plaid error code that means "already gone" (`ITEM_NOT_FOUND` or `INVALID_ACCESS_TOKEN`), the local row is left alone and the client sees a 502 with the error code. This avoids the bad state where local thinks the item is gone but Plaid still sees a live access token (continued billing risk).

For the two "already gone on Plaid's side" codes, the local soft-delete proceeds — this makes the operation idempotent if the user clicks Remove, the request times out after Plaid succeeded, and they click again.

**Alternative considered:** queue/retry on failure. Rejected — single-user app, transient errors are rare, and the user can just click Remove again.

### Decision 5: UI is a plain `confirm()` dialog, no modal

Match the existing UI patterns in `home.eta`: the page already uses `alert()` for error surfaces and inline buttons. A `confirm("Remove <institution>? This stops syncing and removes the connection from Plaid. Historical sync data is kept.")` is consistent and ships in zero lines of CSS.

**Alternative considered:** a proper modal partial. Rejected for this change — the rest of the UI hasn't grown a modal pattern yet, and adding one for a single confirm would be premature.

## Risks / Trade-offs

- **[Risk]** A future feature surfaces `plaidItems.listAll()` results in a context that genuinely wants tombstones (e.g., a "removed institutions" admin page). → Mitigation: the future change introduces `listAllIncludingRemoved()` at that point. Cheap to add later, no churn now.
- **[Risk]** `plaid_accounts` rows for removed items accumulate over time. → Mitigation: in this single-user app, the cardinality is tiny (a few items × a few accounts). If it ever becomes a problem, a manual cleanup script can prune any `plaid_accounts` whose `item_id` is `removed`. Not worth a feature today.
- **[Risk]** `account_mappings` rows for removed accounts continue to appear in `accountMappings.listAll()`. → Mitigation: every consumer of `listAll()` is either inside the sync path (which filters to items that exist in the listAll-filtered items map and skips otherwise) or the home page (which iterates items first and only renders mappings for shown accounts). So stale mapping rows are inert. Confirmed in `runSync.collectTargets()` and `home.eta`.
- **[Trade-off]** The Remove button is unconditional — even items in `requires_relink` can be removed. This is intentional: a broken connection is the most common reason a user would want to remove an item.

## Migration Plan

- **Deploy**: no database migration. New code paths are inert unless the user clicks Remove. Roll out is a normal app deploy.
- **Rollback**: if any item has already been set to `removed` and we roll back, the old code will not know to filter it from `listAll()`, so it would reappear on the home page in a broken state (its Plaid access token is invalidated, so any sync attempt would fail with a Plaid `INVALID_ACCESS_TOKEN` and flip it to `requires_relink`). This is recoverable but ugly. If a rollback is needed before any user has hit Remove, no harm done. If after, a one-line SQL `UPDATE plaid_items SET status='disabled' WHERE status='removed'` makes the removed items invisible to the older code (the existing `setStatus` already supports `disabled`).

## Open Questions

None. The user has confirmed soft-delete semantics and that the Remove button should always be visible (not gated by status).
