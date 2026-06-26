## Context

Plaid accounts are currently saved once at token-exchange time and never updated. The `plaid_accounts` table has no concept of access status — all stored accounts are assumed active. The existing update-mode link flow (`/link/items/:itemId/update-token`) only handles re-authentication, not account selection changes.

Plaid's SDK exposes `account_selection_enabled: true` on `linkTokenCreate` (update mode) to re-show the account picker. After the user completes this flow, `accountsGet` returns only the currently-authorized accounts — so the delta between what's in the DB and what Plaid returns is exactly the set of deselected accounts.

## Goals / Non-Goals

**Goals:**
- Let users add or remove account selections on an existing connection without re-linking from scratch
- Reflect deselected accounts in the UI and exclude them from sync
- Preserve profile mappings across deselection/re-selection cycles

**Non-Goals:**
- Automatic detection of new accounts (no webhook handling)
- Hard-deleting deselected accounts or their mappings
- Changing behavior for the initial link or re-auth (relink) flow

## Decisions

**`access_status` column on `plaid_accounts` (not a separate table)**
Adding a column is the minimal change — the account row already exists, we just need to track whether Plaid currently authorizes it. A separate join table would add complexity without benefit.

**`listByOwner` filters to `active` only; new `listByOwnerAll` for display**
Sync and most internal operations should only ever see active accounts — filtering at the query layer is safer than filtering at call sites. The home page needs all accounts (to show the deselected badge), so a separate `listByOwnerAll` is cleaner than a parameter flag.

**`deselectMissing` marks missing accounts deselected, not deleted**
Hard-deleting would destroy mapping history. Marking deselected preserves the row and mapping so that re-selecting restores full state automatically (the upsert on refresh flips `access_status` back to `active`).

**Separate `/account-select-token` and `/refresh-accounts` endpoints**
Splitting token creation from account refresh keeps each endpoint single-purpose and makes the client flow explicit: get token → open Link → on success, refresh.

**"Manage accounts" button replaces the relink button when status is `active`**
When a connection needs re-auth, re-auth takes priority. When it's healthy, account management is the relevant action. Showing both would clutter the UI.

**Reconcile re-added accounts by `persistent_account_id`, with an identity fallback**
Plaid may issue a new `account_id` when an account is removed and re-added via account selection. Keying only on `account_id` (as `upsert` does) then creates a duplicate row and strands the account's mappings on the old row (FK `ON DELETE CASCADE`, no `ON UPDATE`). We store Plaid's stable `persistent_account_id` and reconcile against it; when it is absent (e.g. rows created before this column, or institutions that don't supply it) we fall back to matching a deselected row in the same item with identical `name`/`mask`/`type`. On a match we move the mappings to the new `account_id` and delete the stale row. Migrating mappings (rather than relying on cascade) keeps the user's mapping intact; the journal needs no migration because `plaid_txn_events` dedups by the globally-unique `plaid_txn_id`, not by `account_id`.

## Risks / Trade-offs

**OAuth institutions always show account select** — Plaid ignores `account_selection_enabled` for OAuth banks and always shows account selection in update mode. This is fine for our purposes but means the behavior is slightly inconsistent across institution types.
→ No mitigation needed; the outcome (user can select accounts) is the same.

**`deselectMissing` races with concurrent refreshes** — If two refresh requests run simultaneously for the same item, both read the current DB state and may double-mark accounts. In practice this is a single-user app with no background refresh, so this is theoretical.
→ Acceptable; SQLite serializes writes anyway.

**Deselected accounts stay visible in the UI indefinitely** — Users who deselect an account will see it greyed out forever unless they re-select or remove the connection. This could become noisy.
→ Acceptable for now; a future "hide deselected" toggle could address it.

**Identity fallback could merge two truly distinct accounts** — If an institution doesn't supply `persistent_account_id` and a user has two deselected accounts with the same name, mask, and type, the fallback could merge the wrong one.
→ Very low likelihood (same name + mask + type within one institution); fallback only targets `deselected` rows, and `persistent_account_id` is preferred whenever present.

## Migration Plan

1. Deploy new migration (`0010_account_access_status.sql`) — adds `access_status TEXT NOT NULL DEFAULT 'active'`. All existing rows get `'active'`, zero downtime.
2. No rollback complexity — the column has a default, so rolling back the code without removing the column is safe.
