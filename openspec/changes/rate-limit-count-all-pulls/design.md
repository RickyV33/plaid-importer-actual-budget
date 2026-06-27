## Context

`runSync` (`src/sync/run.ts`) has two phases. PULL calls Plaid's
`/transactions/sync` once per targeted connection and appends the delta to the
journal — this is the billable event. DRAIN then delivers journal events to each
connected profile and records per-(profile, account) rows in
`sync_account_results`. Failed pulls record failure rows for the connection's
targeted accounts.

The rate limiter (`sync-rate-limit`) counts pulls via
`syncRuns.countPullsForItemSince`, which counts DISTINCT `sync_runs` joined to
`sync_account_results` → `plaid_accounts` for the connection. So the count is
only as complete as the result rows. DRAIN writes nothing when a connection has
no mapped profile, or when the journal slice for a profile is empty (no new
transactions). Those runs pulled Plaid but left no result row, so they are never
counted and the ceiling never trips.

## Goals / Non-Goals

**Goals:**
- Every successful Plaid pull of a connection is counted toward its ceiling,
  including 0-import pulls and pulls of unmapped connections.
- No duplicate counting for connections that already record results (the count is
  DISTINCT by run, and markers are only added when no other row exists).

**Non-Goals:**
- No change to pull/drain/import logic, the limit config, or the skip behavior.
- No new table or migration; reuse `sync_account_results`.
- Failed pulls keep their existing failure-row behavior (already counted).

## Decisions

**1. Record a 0-import marker row for pulled connections with no other result.**
After DRAIN and the existing failure-recording loop, compute the set of
connections that already have a `sync_account_results` row in this run (via
`syncAccountResults.importedByItemForRun(runId)`). For each successfully pulled
target connection (not in `itemErrors`) missing from that set, record one marker
row: a representative *targeted* account of the connection, `status="success"`,
`txns_imported=0`, `reason="pulled"`, `profile_id=NULL`.
- *Why this row shape:* it makes the existing `sync_account_results`-based count
  true for every pull without a schema change, sums to 0 in
  `importedByItemForRun` (so dashboard/connections per-connection totals are
  unaffected), and reads sensibly in History ("pulled, 0 imported").
- *Why after drain:* we only add a marker when drain produced nothing, avoiding
  duplicate rows for normally-drained connections. DISTINCT-by-run counting means
  a marker never inflates a connection that also has real rows.

**2. Representative account always exists.** A connection is a pull target only
because one of its accounts is in `targetAccountIds`, so a targeted account is
always available for the marker.

**3. Errored pulls are left as-is.** Connections in `itemErrors` already record
failure rows for their targeted accounts (so they are counted) and are skipped by
the marker loop.

## Risks / Trade-offs

- *History shows a 0-import "pulled" row for no-op syncs* → acceptable and
  arguably clearer than a run that appears to have touched nothing; only added
  when no real result exists for that connection.
- *Marker uses one representative account* → the count is per connection, not per
  account, so a single row per connection is sufficient and correct.
- *Behavior change is intentional* → connections that import nothing now accrue
  toward the ceiling, matching the limit's purpose (capping Plaid pulls).
