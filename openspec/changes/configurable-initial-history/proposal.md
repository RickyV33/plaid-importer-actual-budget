## Why

On first link, Plaid decides how much transaction history to make available based on `transactions.days_requested`, which the importer never sets — so every newly linked account silently defaults to Plaid's 90-day floor, with no way for an operator to pull deeper history (up to Plaid's 730-day max) without a code change and redeploy.

## What Changes

- Add an admin-configurable **initial transaction history** setting (`days_requested`), stored in the existing `settings` key/value table, validated to Plaid's supported range (90–730 days) with a default of 90.
- Surface the setting on the `/settings` admin page as a number-input card, modeled on the existing sync rate-limit card, admin-gated (members denied), with `en`/`es` i18n labels.
- Wire the configured value into `createLinkToken()` so the `link/token/create` request includes `transactions: { days_requested: N }`.
- Scope: the setting takes effect at link time and applies to **newly linked accounts only** — it does not retroactively deepen history for already-linked items.
- Ongoing/recurring sync is unchanged: it stays purely cursor-driven and gets no window setting.

## Capabilities

### New Capabilities
- `initial-history-window`: admin-configurable depth of initial transaction history requested from Plaid at link time, stored as a setting and validated to the 90–730 day range with a 90-day default.

### Modified Capabilities
- `plaid-link`: the link-token creation requirement now additionally passes `transactions.days_requested`, sourced from the `initial-history-window` setting (falling back to the default when unset).

## Impact

- **Code**: `src/plaid/link.ts` (`createLinkToken` — pass `transactions.days_requested`), `src/routes/settings.ts` (read/write + POST handler + validation), `src/views/settings.eta` (new card), `src/db/queries.ts` (new settings key constant), `src/i18n/en.ts` + `src/i18n/es.ts` (labels/help text).
- **Storage**: one new row in the existing `settings` table; no migration required (table already exists).
- **Behavior**: affects only future link-token creations; existing items, cursors, and ongoing syncs are untouched. No breaking changes.
