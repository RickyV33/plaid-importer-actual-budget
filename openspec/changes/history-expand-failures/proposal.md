## Why

The History drill-down is currently offered only when a run imported at least one
transaction (`history-row-expand`). That hides the per-account detail for **failed**
runs, where the per-account `reason` is exactly what a user needs to diagnose what
went wrong. A failed run imports nothing, so the "imported > 0" gate excludes it.

## What Changes

- A run is expandable when it imported at least one transaction **or** its status
  is `failure`. Successful runs that imported nothing (including no-op
  marker-only pulls) still render as plain, non-expandable rows.

No other change to the History page, columns, or recorded data.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `sync-history`: the per-account drill-down is offered for runs that imported at
  least one transaction or that failed; successful runs that imported nothing
  remain non-expandable.

## Impact

- **Views** (`src/views/history.eta`): widen the `expandable` condition to include
  `run.status === "failure"`.
- No styles, routes, queries, migrations, or i18n changes.
