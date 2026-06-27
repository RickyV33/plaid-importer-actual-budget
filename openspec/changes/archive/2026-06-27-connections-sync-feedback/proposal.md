## Why

After a sync on the Connections page, the result area shows a single combined
line ("Sync success: imported N") plus any skipped-connection message, then the
page reloads after ~1.8 seconds — wiping the message before a user can read it.
The skipped-limit hint (e.g. "Skipped (sync limit reached): Chase (retry in ~524
min)") is exactly the thing a user wants to keep visible, and there's no
per-connection breakdown of how much each connection imported.

This change makes per-connection results and the skip messages persistent and
dismissible, attaches each message to the connection it concerns, keeps a running
total below the sync buttons, and removes the disruptive auto-reload (replaced by
a 60-second auto-clear fallback).

## What Changes

- `POST /sync` returns a per-connection result breakdown alongside the existing
  total: for each connection that was synced, the number of transactions imported
  and its updated last-synced timestamp; skipped connections continue to be
  reported with their retry hint.
- The Connections page renders each connection's outcome on that connection's own
  card: an imported count for synced connections, and a persistent
  skipped-limit message (with retry hint) for throttled ones.
- Each per-connection message and the overall total are dismissible (an × /
  close control) and persist until dismissed, with a 60-second auto-clear as a
  fallback. The total ("Sync success: imported N transactions") remains below the
  sync buttons.
- The page no longer auto-reloads after a sync. Instead the per-connection last
  sync line is updated in place from the response, so timing stays current
  without discarding the result messages.
- Add English + Spanish strings for the new affordances; no hardcoded strings.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `transaction-sync`: the `POST /sync` response includes a per-connection result
  breakdown (imported count + updated last-synced timestamp) so the UI can show
  per-connection feedback, and sync results are presented per connection and
  persist until dismissed (with a 60-second fallback) rather than being cleared
  by an auto-reload.
- `sync-rate-limit`: a skipped-connection message is shown on the affected
  connection and persists until the user dismisses it (with a 60-second
  fallback), instead of disappearing on reload.

## Impact

- **Routes** (`src/routes/sync.ts`): include a per-connection breakdown in the
  `/sync` JSON response — for each synced connection, `{ itemId, imported,
  lastSyncedAt }`; keep `skipped[]` and the overall `totalImported`.
- **Sync run** (`src/sync/run.ts`): expose per-connection imported counts from
  the run so the route can assemble the breakdown (per-account results are
  already recorded; aggregate to per-connection).
- **Views** (`src/views/connections.eta`): render per-connection result/skip
  messages on each item card with a dismiss control; keep the total below the
  sync buttons; remove the `setTimeout(reload, 1800)`; update each card's last
  sync line from the response; add a 60-second auto-clear timer.
- **Styles** (`public/style.css`): styles for the per-connection message + close
  button (reuse existing result/warn patterns; solid colors).
- **i18n** (`src/i18n/en.ts`, `src/i18n/es.ts`): keys for the dismiss control and
  per-connection imported-count message.
- **Docs**: refresh root `mental-model.html` and `README.md` at archive time.
- No migrations, no dependency changes.
