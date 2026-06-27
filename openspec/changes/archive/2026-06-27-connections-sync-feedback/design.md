## Context

The Connections page (`src/views/connections.eta`) syncs via `fetch('/sync')`
(`POST /sync` in `src/routes/sync.ts`) and renders the JSON result into a single
`#sync-result` area: one combined success/failure line plus a combined skipped
line, then `setTimeout(() => window.location.reload(), 1800)`. The reload is what
refreshes each connection card's "last sync" text, but it also destroys the
result and skip messages almost immediately.

`POST /sync` currently returns `{ status, totalImported, runId, skipped[] }`.
`skipped[]` already carries `{ name, retryAfterMinutes }` per over-limit
connection (`sync-rate-limit`). It does **not** return any per-connection import
counts, even though `runSync` records per-account results in
`sync_account_results` during the run. The response has no connection identifier
for skipped entries either (only `name`).

## Goals / Non-Goals

**Goals:**
- Per-connection import counts surfaced on each connection's card.
- Skip messages attached to the affected connection, persistent and dismissible.
- A running total kept below the sync buttons.
- No auto-reload; per-connection last-sync updated in place; 60s auto-clear
  fallback for messages.
- en + es catalogs updated; no hardcoded strings.

**Non-Goals:**
- No change to which connections are throttled or to rate-limit computation.
- No change to how transactions are fetched, normalized, or pushed to Actual.
- No server-side persistence of dismissals — messages are transient client UI.
- No change to the Schedules or Profiles pages.

## Decisions

**1. `/sync` returns a per-connection breakdown keyed by connection id.** Extend
the response to `{ status, totalImported, runId, synced: [{ itemId, imported,
lastSyncedAt }], skipped: [{ itemId, name, retryAfterMinutes }] }`. Adding
`itemId` to `skipped` lets the client attach the skip message to the right card
(today skips carry only a display name). `synced[].lastSyncedAt` lets the client
refresh each card's last-sync line without a reload.
- *Alternative considered:* keep the response as-is and re-fetch the page region.
  Rejected — the run already has the data; returning it avoids a second request
  and a full reload.

**2. Aggregate per-connection counts from the run's per-account results.**
`runSync` already records `sync_account_results` (per account, with
`txns_imported` and `plaid_account_id`). The route (or run) aggregates these to a
per-connection (`item_id`) sum for the run just executed. Connections that ran but
imported nothing report `imported: 0`, so every attempted connection gets a line.
- *Alternative considered:* count inside the Plaid pull loop. Rejected — the
  recorded per-account results are the source of truth and already exist.

**3. Messages are transient client state, not server-persisted.** A
rate-limit skip is time-bound — its "retry in ~524 min" goes stale as the window
clears, and the throttle no longer applies after the window. Persisting dismissal
server-side (like the real banners) would risk re-showing a stale message.
Instead the message lives in the DOM until the user clicks its × or the 60-second
fallback timer clears it.
- *Alternative considered:* reuse the `dismissed_banners` mechanism. Rejected —
  that is for durable, app-level banners; sync results are per-action and
  ephemeral.

**4. Replace auto-reload with in-place updates.** Remove
`setTimeout(reload, 1800)`. On a successful response, for each `synced` entry,
update that card's last-sync line from `lastSyncedAt`; render each connection's
imported count and each skip message into its card with a close button; render
the overall total below the sync buttons. A single 60-second timer clears the
result/skip messages if the user hasn't dismissed them.
- *Alternative considered:* keep reload but stash messages in `sessionStorage` and
  re-render after load. Rejected — needlessly complex versus updating in place.

**5. Total stays below the sync buttons, also dismissible.** The overall
"imported N" total keeps its current position under the buttons and gains the same
close affordance and 60s fallback as the per-connection messages.

## Risks / Trade-offs

- *Stale last-sync without reload* → mitigated by updating each card's last-sync
  line from `synced[].lastSyncedAt` in the response; other card data (account
  rows) is unchanged by a sync, so a full reload isn't needed.
- *Many messages clutter the page* → each is dismissible and auto-clears at 60s;
  messages are scoped to the connection they concern rather than stacked in one
  area.
- *Response shape change* → additive (`synced[]` is new; `skipped[]` gains
  `itemId`); existing fields (`status`, `totalImported`, `runId`) are unchanged,
  so nothing else that reads the response breaks.
- *Accessibility of the close control* → give it an `aria-label`/`title`, matching
  the icon-button pattern used elsewhere.
