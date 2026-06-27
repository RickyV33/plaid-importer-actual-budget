## Why

The dashboard collapses sync timing into two single values: one "last sync"
(the max `last_synced_at` across all connections) and one "next sync" (the min
`next_run_at` across all schedules). A user with two connections can't tell which
one synced when, or which is due next. The dashboard also says nothing about how
much it has actually imported over time, even though every run's
`total_imported` is already persisted in `sync_runs`.

This change makes the dashboard show last sync and next sync **per connection**,
and adds an imported-transactions summary over rolling 7/30/60/90-day windows.

## What Changes

- Replace the single "last sync" and "next sync" dashboard cards with a
  per-connection view: each connection lists its own last sync time and its own
  next scheduled sync time. Next sync for a connection is the soonest
  `next_run_at` among the owner's enabled schedules that target that connection;
  connections with no enabling schedule show a calm "no schedule" state.
- Add a dashboard summary of imported transactions over the last 7, 30, 60, and
  90 days, computed as the sum of `sync_runs.total_imported` for the owner within
  each window. No new persistence — it aggregates existing history.
- Keep the dashboard read-only and free of Plaid/Actual network calls; all
  figures derive from locally stored state.
- Add English + Spanish strings for the new labels; no hardcoded strings.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `app-navigation`: the landing dashboard presents last sync and next sync per
  connection (instead of a single global value for each) and adds a windowed
  imported-transactions summary, while remaining read-only and network-free.
- `sync-history`: imported totals are queryable as a sum of `total_imported`
  over rolling time windows, owner-scoped, without schema changes.

## Impact

- **Queries** (`src/db/queries.ts`): add an owner-scoped query summing
  `sync_runs.total_imported` since a cutoff timestamp (callable per window);
  reuse existing `plaidItems.listByOwner` (carries `last_synced_at`) and
  `schedules.listByOwner` (carries `next_run_at` + `plaid_item_ids`).
- **Routes** (`src/routes/home.ts`): build a per-connection
  last/next view (join connections to the soonest enabling schedule's
  `next_run_at`) and the four windowed totals; pass both to the dashboard view.
  Remove the single collapsed `lastSyncedAt`/`nextRunAt` reductions.
- **Views** (`src/views/dashboard.eta`): replace the two single-value sync cards
  with a per-connection last/next table and add a windowed-totals card.
- **Styles** (`public/style.css`): styles for the per-connection rows and the
  totals figures (reuse existing card patterns; solid colors only).
- **i18n** (`src/i18n/en.ts`, `src/i18n/es.ts`): new keys for the window labels,
  "no schedule", and the imported-totals heading.
- **Docs**: refresh root `mental-model.html` and `README.md` at archive time.
- No migrations, no API contract changes, no dependency changes.
