## Context

`src/views/history.eta` renders each run as a summary `<tr>` (timestamp, trigger
badge, scope, status, total imported). When `run.results.length > 0` it emits a
second `<tr><td colspan=5>` containing a `<details>` whose `<summary>` reads
"per-account results" and whose body is the per-account table. The detail is
gated on having any result rows.

With the rate-limit marker change, a no-op pull now records a 0-import marker
result row, so `results.length > 0` is true even for runs that imported nothing —
each would render an expandable detail holding only the marker. The useful signal
is `run.totalImported`.

## Goals / Non-Goals

**Goals:**
- The run's own row is the expand toggle; no separate summary row.
- Drill-down offered only when `totalImported > 0`.
- Same per-account table shown when expanded; keyboard-accessible.

**Non-Goals:**
- No change to recorded data, columns, pagination, or the orphan banner.
- No change to the per-account table's contents.

## Decisions

**1. Gate the drill-down on `run.totalImported > 0`.** A run that imported
nothing — including the new marker-only no-op pulls and runs with only failures —
renders as a plain, non-expandable row. This is the literal "only when there are
imported transactions" rule and naturally hides marker noise.
- *Trade-off:* a failed run (0 imported, failure rows with reasons) is no longer
  expandable; its `failure` status is still shown in the status column. Accepted
  to keep the rule simple and the list calm; can be revisited if seeing failure
  reasons inline becomes important.

**2. The run row is the toggle; detail is a hidden sibling row.** Expandable rows
get a caret, `role="button"`, `tabindex="0"`, and `aria-expanded`; the per-account
detail is a following `<tr class="history-detail" hidden>`. A small script toggles
`hidden` + `aria-expanded` + caret rotation on click and on Enter/Space. This
avoids wrapping table rows in `<details>` (which doesn't compose with table
markup) while keeping it accessible.
- *Alternative considered:* keep `<details>` inside the cell. Rejected — the ask is
  to toggle from the row itself, not a nested summary.

**3. Reuse the existing per-account table.** The revealed detail is the same
account/status/imported/reason table as today; only its wrapper and trigger
change.

## Risks / Trace-offs

- *No-JS users can't expand* — acceptable: the page is already script-enhanced
  (orphan ack), and the summary row carries the key fields (status, total).
- *Accessibility* — the toggle exposes `role="button"`, `tabindex`, and
  `aria-expanded`, and responds to Enter/Space, matching native disclosure
  semantics.
