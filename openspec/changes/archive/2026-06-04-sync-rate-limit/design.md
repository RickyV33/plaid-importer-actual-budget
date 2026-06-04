## Context

`POST /sync` runs unthrottled today ([sync.ts](../../../src/routes/sync.ts)); the only existing limiter is per-IP on `/login`. After `multi-user-auth`, runs record `owner_user_id` + `started_at` on `sync_runs`, and `sync_account_results` records which `plaid_account_id`s each run touched — enough to count, per connection, how many times it was pulled in a window without any schema change. Counting per *connection* (rather than per sync run) was chosen so that syncing connections one-by-one isn't penalized versus syncing them all at once: each connection costs "1" per run that touches it, regardless of batching.

## Goals / Non-Goals

**Goals:**
- Admin-configurable ceiling of `N` pulls per connection per `X` hours.
- Skip over-limit connections and let the rest sync ("finish the others").
- No new schema; reuse `settings`, `sync_runs`, `sync_account_results`, `plaid_accounts`.
- Off by default.

**Non-Goals:**
- Global/instance-wide cap (decided: per-connection).
- Rejecting the whole request when one connection is over (decided: skip-and-continue).
- A separate allowance for scheduled vs manual runs (they share the per-connection count).

## Decisions

**Count per connection via existing run/result tables.**
For a connection (Plaid item), its pulls in the window =
`COUNT(DISTINCT sr.id)` over `sync_runs sr JOIN sync_account_results sar ON sar.sync_run_id = sr.id JOIN plaid_accounts pa ON pa.plaid_account_id = sar.plaid_account_id WHERE pa.item_id = ? AND sr.started_at >= now - X*3600_000`. One run that touched the connection counts once, however many of its accounts were involved. Rolling window matches "N times every X hours." Runs count regardless of terminal status (a failed pull may still have hit Plaid).

**Skip-and-continue, enforced in the route by filtering targets.**
`POST /sync` resolves the requested accounts to their connections, drops accounts whose connection is at/over `N`, and passes the remaining accounts to `runSync` as a `selected` set. Skipped connections are returned in the response (with a retry hint) so the UI can report them. `runSync` itself stays unaware of throttling. If every targeted connection is over its limit, no run is created and the response simply lists all connections as skipped.

**Config in the `settings` table, admin-managed.**
Two keys (e.g. `sync_ratelimit_max`, `sync_ratelimit_window_hours`) set on `/settings`, consistent with the registration secret; editable without redeploy. Env vars were declined — admin wanted runtime control.

**Disabled when unset.**
If either value is missing or non-positive, the ceiling is off, so existing deployments are unaffected until an admin opts in and nobody is surprised by a lockout on upgrade.

**Retry hint.**
For a skipped connection, the soonest it can sync again = `oldest_in_window_run.started_at + X hours - now`. The UI shows a friendly aggregate ("retry in ~Yh") across skipped connections.

## Risks / Trade-offs

- **A failed/aborted run still consumes a connection's allowance** → Intended: failed runs can still incur Plaid calls, so counting them is conservative and cost-protective. Documented.
- **Per-connection count query joins three tables** → Negligible at this scale; `sync_account_results(sync_run_id)` and `sync_runs(owner_user_id, started_at)` indexes cover it. Computed once per targeted connection per request.
- **"All connections skipped" is a no-op sync** → Returned as a normal result listing every connection as skipped (not an error), so the UI can explain it.
- **Counting model vs the future journal (profiles change)** → Per-connection counting via runs/results remains valid; if the profiles change later wants to count actual journal pulls, the same per-connection notion carries over.

## Migration Plan

1. No migration. On deploy, the ceiling is inactive until an admin sets values on `/settings`.
2. Rollback: previous build ignores the two settings keys; `POST /sync` reverts to unthrottled.

## Open Questions

- Whether to show each connection's remaining allowance on the home page (nice-to-have). Deferred.
