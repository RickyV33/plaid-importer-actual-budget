## 1. History view

- [x] 1.1 In `src/views/history.eta`, gate the drill-down on `run.totalImported > 0` (instead of `run.results.length > 0`)
- [x] 1.2 Make the run summary row the toggle: caret, `role="button"`, `tabindex="0"`, `aria-expanded`; remove the separate `<details>`/"per-account results" summary
- [x] 1.3 Render the per-account table in a following `<tr class="history-detail" hidden>` revealed by the toggle
- [x] 1.4 Add a script toggling the detail row on click and Enter/Space (updating `aria-expanded` + caret)

## 2. Styles

- [x] 2.1 Add expandable-row affordance to `public/style.css` (caret, pointer/hover) and the hidden detail row

## 3. Verify

- [x] 3.1 Run `npm test` in the dev container and confirm green
- [x] 3.2 Manually verify: a run with imports expands from its row; a 0-import run is a plain row; keyboard toggle works (user to verify in-app)
- [x] 3.3 Per-change `mental-model.html` delta created for this change
