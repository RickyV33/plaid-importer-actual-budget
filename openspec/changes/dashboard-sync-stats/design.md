## Context

The landing dashboard (`GET /` in `src/routes/home.ts`, rendered by
`src/views/dashboard.eta`) is read-only and derives everything from local state.
Today it computes a single `lastSyncedAt` by reducing `plaid_items.last_synced_at`
to its max, and a single `nextRunAt` by reducing enabled schedules'
`next_run_at` to its min. Each renders as one card.

The data for a per-connection view already exists: `plaidItems.listByOwner`
returns each connection with its own `last_synced_at`, and `schedules.listByOwner`
returns each schedule's `next_run_at` plus its `plaid_item_ids` (a JSON array of
the connections it targets). Imported history lives in `sync_runs` with
`total_imported`, `started_at`, and `owner_user_id`, and is retained indefinitely
(no pruning). `sync_runs` is already indexed by `(owner_user_id, started_at)`.

## Goals / Non-Goals

**Goals:**
- Per-connection last sync and next sync on the dashboard.
- Imported-transaction totals over rolling 7/30/60/90-day windows.
- Stay read-only and free of Plaid/Actual calls; derive from local state only.
- en + es catalogs updated; no hardcoded strings.

**Non-Goals:**
- No new persistence or migration (windowed totals aggregate existing rows).
- No change to the connections page (it already shows per-connection last sync;
  this change does not add next sync there).
- No change to how syncs run, how schedules fire, or how history is recorded.
- No per-account or per-profile breakdown — the unit is the connection.

## Decisions

**1. Next sync per connection = soonest enabling schedule.** For each connection,
next sync is `min(next_run_at)` over the owner's `enabled` schedules whose
`plaid_item_ids` includes that connection and whose `next_run_at` is non-null. A
connection targeted by no enabled schedule has no next sync and renders a calm
"no schedule" state. This is computed in the route by indexing schedules by
connection id; no SQL change is needed.
- *Alternative considered:* show each schedule's next run rather than each
  connection's. Rejected — the user asked for per-connection, and a connection
  is the stable unit that also carries `last_synced_at`.

**2. Last sync per connection = `plaid_items.last_synced_at`.** Use the
connection's own stored timestamp (updated by any sync touching it), not the
schedule's `last_run_at`. This matches what the connections page already shows and
reflects manual syncs too.
- *Alternative considered:* schedule `last_run_at`. Rejected — it would miss
  manual syncs and isn't defined for connections without a schedule.

**3. Windowed totals = sum of `total_imported` per window.** Add a query that
sums `sync_runs.total_imported` for the owner where `started_at >= cutoff`, called
once per window (7/30/60/90 days from now). Counting transactions imported (not
runs) matches the user's intent. Windows are independent cumulative sums (the
30-day figure includes the 7-day figure), which is the natural reading of "N
imported in the last 30 days".
- *Alternative considered:* one grouped query bucketing rows into windows.
  Rejected — four simple indexed sums are clearer and cheap given the existing
  `(owner_user_id, started_at)` index; the dashboard is not hot.

**4. Cutoffs computed in the route from "now".** The four cutoffs are
`now - {7,30,60,90} * 86_400_000`. Day-length arithmetic (not calendar months) is
deterministic, timezone-agnostic for the sum, and adequate for a rolling summary.

**5. Presentation.** Replace the two single-value sync cards with: (a) a
per-connection block listing each connection's name, last sync, and next sync
(empty state when the user has no connections); and (b) a single imported-totals
card showing four figures labeled 7d/30d/60d/90d. Both remain read-only with no
create/edit/delete controls and no external calls. The connection-count and
profile-count cards are unchanged.

## Risks / Trade-offs

- *Many connections lengthen the dashboard* → render the per-connection list
  compactly (name + two timestamps) and rely on the existing mobile-first card
  stacking; this is bounded by how many banks a user links.
- *Cumulative windows could read as additive* → clear labels ("last 7/30/60/90
  days") and consistent figures avoid implying the windows are disjoint buckets.
- *Failed runs and `total_imported`* → sum `total_imported` as recorded; failed
  runs contribute their imported count (typically 0), matching history semantics.
- *Read-only guarantee preserved* → only new read queries are added; no mutation
  and no Plaid/Actual calls enter the dashboard path.
