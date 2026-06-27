## Why

On the History page, a run's per-account detail lives in a second table row with
its own "per-account results" `<details>`/`<summary>` toggle, shown whenever the
run has any result rows. Now that every pull records at least a 0-import marker
row (see rate-limit-count-all-pulls), runs that imported nothing would each show
an expandable detail containing only a 0-import "pulled" marker — noise. The
drill-down is only interesting when a run actually imported transactions, and the
separate summary row is redundant when the run row could be the toggle itself.

## What Changes

- Make the run's summary row itself the expand/collapse control, replacing the
  separate "per-account results" summary line.
- Only offer the drill-down when the run imported more than zero transactions; a
  run that imported nothing (including no-op marker-only pulls) renders as a plain
  non-expandable row.
- Expanding a run reveals the same per-account results table (account, status,
  imported, reason) as before.

No change to what is recorded, to the run summary columns, or to the orphan
banner. Presentation only.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `sync-history`: the per-account drill-down is toggled from the run's own row and
  is offered only for runs that imported at least one transaction; runs that
  imported nothing render as plain rows.

## Impact

- **Views** (`src/views/history.eta`): make the run row the toggle (caret +
  accessible expanded state), gate it on `totalImported > 0`, drop the separate
  `<details>`/"per-account results" summary, keep the per-account table as the
  revealed detail row; add the toggle script.
- **Styles** (`public/style.css`): expandable-row affordance (caret, hover) and
  hidden detail row.
- **i18n**: the `history.perAccount` summary label is no longer rendered (kept in
  the catalog; no new user-facing strings required).
- No routes, queries, migrations, or contract changes.
