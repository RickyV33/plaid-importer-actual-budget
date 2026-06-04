## 1. Data access

- [x] 1.1 Add a per-connection window count to `src/db/queries.ts`, e.g. `syncRuns.countPullsForItemSince(itemId, sinceTs)` → `COUNT(DISTINCT sr.id)` over `sync_runs sr JOIN sync_account_results sar ON sar.sync_run_id = sr.id JOIN plaid_accounts pa ON pa.plaid_account_id = sar.plaid_account_id WHERE pa.item_id = ? AND sr.started_at >= ?`. Add a helper for the oldest in-window run timestamp per item (for retry hints).
- [x] 1.2 Add typed settings accessors/keys for `sync_ratelimit_max` and `sync_ratelimit_window_hours`, plus a helper returning `{ max, windowHours } | null` (null = disabled when unset/non-positive).

## 2. Enforcement (skip-and-continue)

- [x] 2.1 In `src/routes/sync.ts`, resolve the requested accounts to their owned connections (expand `scope=all` to the user's accounts first). If a limit is configured, compute each connection's window count; mark connections at/above `max` as skipped.
- [x] 2.2 Drop accounts belonging to skipped connections; pass the remaining accounts to `runSync` as `scope=selected`. If none remain, do not call `runSync`.
- [x] 2.3 Return a result that includes the synced outcome plus a `skipped` list (connection name/id + `retryAfterMinutes` from the oldest in-window run). Ensure no Plaid calls happen for skipped connections.

## 3. Admin settings UI

- [x] 3.1 Extend `src/routes/settings.ts` (admin-guarded) to read/write the max and window-hours settings; validate positive integers; members 403.
- [x] 3.2 Add the two fields to `src/views/settings.eta` with current values and a short note (blank/0 disables).

## 4. Home page

- [x] 4.1 Update the sync-result handling in `src/views/home.eta` to render skipped connections (names + retry hint) alongside the normal results.

## 5. Tests & docs

- [x] 5.1 Tests: per-connection count is batching-independent (one run touching A+B vs two runs) and isolated per connection; window roll-off; effective-limit helper returns null when unset/non-positive.
- [x] 5.2 Tests: a mixed request skips the over-limit connection and syncs the rest (no run row references the skipped connection); all-over-limit creates no run.
- [x] 5.3 Update `README` to document the per-connection sync ceiling — admin-configured on `/settings`, disabled by default, skip-and-continue behavior.
