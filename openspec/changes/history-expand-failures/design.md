## Context

`src/views/history.eta` computes `var expandable = run.totalImported > 0 &&
run.results.length > 0;` and only emits the toggle + detail row when true. Failed
runs record per-account failure rows (with a `reason`) but import 0 transactions,
so the current gate hides their detail.

## Goals / Non-Goals

**Goals:**
- Failed runs are expandable so their per-account `reason` is visible.
- Successful no-op pulls (marker-only, 0 imported) stay non-expandable.

**Non-Goals:**
- No change to the toggle mechanics, styles, columns, or recorded data.

## Decisions

**Widen the gate to `results.length > 0 && (totalImported > 0 || status ===
"failure")`.** Keeping `results.length > 0` is defensive (nothing to show
otherwise). A successful run with 0 imported has only a 0-import marker and stays
plain; a failed run becomes expandable to surface reasons.
- *Alternative considered:* expand whenever `results.length > 0`. Rejected — that
  reintroduces expandable no-op pulls, the noise `history-row-expand` removed.

## Risks / Trade-offs

- *A failed run's detail may include a marker row* — only if the same run also had
  a connection that pulled with no result; acceptable and accurate.
