## 1. Data layer (`src/db/queries.ts`)

- [x] 1.1 Widen `PlaidItemRow["status"]` from `"active" | "requires_relink" | "disabled"` to also include `"removed"`
- [x] 1.2 Update `plaidItems.setStatus`'s parameter type to match the widened union (auto-propagates from `PlaidItemRow["status"]`)
- [x] 1.3 Change `plaidItems.listAll()` to `SELECT * FROM plaid_items WHERE status != 'removed' ORDER BY created_at ASC` so home/sync naturally skip removed items
- [x] 1.4 Confirm by reading that `plaidItems.get(id)` is unchanged (so the delete route can still load a row to act on it, and a second click is idempotent)

## 2. Plaid wrapper (`src/plaid/link.ts`)

- [x] 2.1 Add an exported `removeItem(accessToken)` thin wrapper calling `plaid.itemRemove({ access_token })`; return the raw response
- [x] 2.2 Reuse the existing `classifyPlaidError` from `src/plaid/sync.ts` (already exported)

## 3. Route — `DELETE /link/items/:itemId` (`src/routes/link.ts`)

- [x] 3.1 Register the new route in `registerLinkRoutes`
- [x] 3.2 Look up the item via `plaidItems.get(req.params.itemId)`; respond 404 if missing
- [x] 3.3 If the item is already `status='removed'`, respond 204 immediately (idempotent re-delete) without calling Plaid
- [x] 3.4 Decrypt the access token; call `removeItem(accessToken)`
- [x] 3.5 On success → `plaidItems.setStatus(itemId, 'removed')` → reply 204
- [x] 3.6 On Plaid error: if classified code is `ITEM_NOT_FOUND` or `INVALID_ACCESS_TOKEN`, treat as already-gone → soft-delete locally → reply 204
- [x] 3.7 Any other Plaid error: log via `app.log.error({ err, itemId }, 'item_remove_failed')`, do NOT touch local status, reply 502 with the upstream error code in the JSON body (mirroring the existing `plaid_exchange_failed` shape)

## 4. UI — Remove button (`src/views/home.eta`)

- [x] 4.1 In `.item-actions`, add a `<button type="button" class="remove-btn secondary" data-item-id="<%= item.id %>" data-institution="<%= item.institutionName ?? '' %>">Remove</button>`, rendered unconditionally for every item
- [x] 4.2 Add a JS handler (inside the existing `(function(){ ... })();` IIFE) that on click runs `confirm("Remove <institution>? This stops syncing and disconnects from Plaid. Historical sync data is kept.")` — falls back to "this connection" when institution name is empty
- [x] 4.3 On confirm, fetch `DELETE /link/items/<itemId>`; on 204 → `window.location.reload()`; on non-2xx → `alert('Could not remove this connection. Check server logs.');` and leave the button enabled
- [x] 4.4 Disable the button while the request is in flight to avoid double-click double-submits

## 5. Verification

- [x] 5.1 Type-check: `npx tsc --noEmit` (or whatever the repo's check command is) passes after the union widening
- [x] 5.2 Manual: in dev, link a sandbox item, click Remove, confirm: item disappears from home, item is gone from Plaid dashboard, history of any prior runs still renders that item's account names
- [x] 5.3 Manual idempotency: in dev, with one item already `removed`, hit `DELETE /link/items/:itemId` again and confirm 204 with no Plaid call (verify by checking server logs are quiet)
- [x] 5.4 Manual sync exclusion: trigger `POST /sync` with `scope=all` after a removal; confirm no `sync_account_results` rows exist for the removed item's accounts for that run
- [x] 5.5 Manual selected-scope exclusion: trigger `POST /sync` with `scope=selected` naming a removed item's account alongside an active item's account; confirm only the active account is reflected in the run
