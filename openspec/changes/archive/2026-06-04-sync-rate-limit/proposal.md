## Why

Plaid bills per connection pull, so frequent syncing runs up cost. There's no ceiling on `POST /sync` today ([sync.ts](../../../src/routes/sync.ts)). This adds an admin-configurable **per-connection** ceiling: each linked connection (Plaid item) may be synced at most `N` times per `X` hours. Counting per connection — rather than per sync run — means it doesn't matter whether you sync all banks in one click or one at a time; each connection costs "1" either way, so the one-by-one workflow isn't unfairly penalized.

## What Changes

- Add an admin-configurable, DB-stored **per-connection ceiling**: a maximum number of pulls (`N`) per linked connection within a rolling window of `X` hours, set on the existing `/settings` page (alongside the registration secret).
- Enforce on `POST /sync`: resolve the requested accounts to their connections; for each connection, count how many times it was pulled in the window. Connections at or above `N` are **skipped**; the remaining connections sync normally. The response reports which connections were skipped and roughly when they can be synced again. **No Plaid calls are made for skipped connections.**
- Counting uses existing data — distinct sync runs in the window that touched a connection, via `sync_account_results` → `plaid_accounts.item_id` → `sync_runs.started_at` (all present after `multi-user-auth`). No schema change.
- The ceiling is **disabled when unset** — existing deployments are unaffected until an admin opts in.
- The home page surfaces skipped connections in the existing sync-result area.

## Capabilities

### New Capabilities
- `sync-rate-limit`: the per-connection sync ceiling — its admin configuration, the rolling-window per-connection counting rule, and the skip-and-continue behavior when a connection is over its limit.

### Modified Capabilities
- `transaction-sync`: `POST /sync` excludes accounts belonging to over-limit connections before the run; the request still succeeds for the rest.

## Impact

- **Schema**: none. Reuses the `settings` table (two keys) plus `sync_runs` / `sync_account_results` / `plaid_accounts` from prior changes.
- **Code**:
  - `src/db/queries.ts` — add a per-connection pull count over a window (`COUNT(DISTINCT sync_run_id)` joined to the item); typed accessors for the max and window settings.
  - `src/routes/sync.ts` — resolve targets to connections, filter out over-limit ones, run the rest, and return the skipped list with retry hints.
  - `src/routes/settings.ts` + `settings.eta` — admin fields for max and window hours (members 403).
  - `src/views/home.eta` — render skipped-connection notices in the sync-result area.
- **Out of scope**: global/instance-wide ceiling (chosen per-connection), rejecting the whole request when one connection is over (chosen skip-and-continue), and throttling scheduled syncs beyond this shared per-connection count (scheduling is a separate change).
