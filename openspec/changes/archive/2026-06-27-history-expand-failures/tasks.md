## 1. History view

- [x] 1.1 In `src/views/history.eta`, widen `expandable` to `run.results.length > 0 && (run.totalImported > 0 || run.status === "failure")`

## 2. Verify

- [x] 2.1 Run `npm test` in the dev container and confirm green
- [x] 2.2 Manually verify: a failed run is expandable and shows reasons; a successful 0-import run is a plain row; an imported>0 run still expands (user to verify in-app)
- [x] 2.3 Per-change `mental-model.html` delta created for this change
