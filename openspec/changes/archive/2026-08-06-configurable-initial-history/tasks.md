## 1. Settings storage

- [x] 1.1 Add an `INITIAL_HISTORY_DAYS_KEY` settings key constant in `src/db/queries.ts`, alongside the existing `SYNC_RATELIMIT_*` keys.
- [x] 1.2 Add a shared helper that reads the key via `settings.get`, parses it as an integer, and falls back to the 90-day default when unset, non-numeric, or outside 90–730; unit-test the fallback and clamp cases.

## 2. Plaid link wiring

- [x] 2.1 In `src/plaid/link.ts`, have `createLinkToken()` resolve the window via the helper and include `transactions: { days_requested: N }` in the `LinkTokenCreateRequest`.
- [x] 2.2 Confirm update-mode token creation (`/link/items/:itemId/update-token`) does NOT apply the setting, so re-auth stays unchanged.
- [x] 2.3 Unit-test `createLinkToken()`: configured value is passed through; unset/invalid setting yields `days_requested: 90`.

## 3. Admin route

- [x] 3.1 Extend `viewData()` in `src/routes/settings.ts` to expose the current value (or default) to the settings view.
- [x] 3.2 Add a `POST` handler for the new setting that validates 90–730 inclusive and persists via `settings.set`, re-rendering with a validation error on bad input.
- [x] 3.3 Verify the route is covered by `requireAdmin` so members receive 403.
- [x] 3.4 Unit-test the handler: valid write persists; below 90, above 730, and non-numeric are each rejected without changing the stored value; member access is denied.

## 4. UI and i18n

- [x] 4.1 Add the number-input card to `src/views/settings.eta`, modeled on the sync rate-limit card, mobile-first and flex-based.
- [x] 4.2 Add `en` and `es` message-catalog entries for the card label, validation error, and help text covering both (a) the value applies to newly linked accounts only and (b) deeper history may have billing implications depending on the operator's Plaid plan, directing them to their Plaid Dashboard. Do not name a specific fee or amount — Transactions pricing is contract-specific and no history-depth surcharge is documented for the Transactions product.
- [x] 4.3 Confirm no user-facing string is hardcoded in the template.

## 5. Verification

- [x] 5.1 Run the full test suite in the dev container and confirm it passes.
- [x] 5.2 Manually verify end to end: set the value on `/settings`, confirm it persists across a reload, and confirm a newly created link token carries the configured `days_requested`.
