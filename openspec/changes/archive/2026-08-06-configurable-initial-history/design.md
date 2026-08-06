## Context

The importer pulls transactions exclusively through Plaid's cursor-based `/transactions/sync`. There is no `start_date`/`end_date` anywhere in the code. On a fresh link the item's `cursor` is `NULL`, so the first sync omits the cursor and Plaid streams its full *available* history — but the depth of that available history is fixed at link time by `transactions.days_requested` on `/link/token/create`. Today `createLinkToken()` (`src/plaid/link.ts`) never sets it, so Plaid uses its 90-day floor.

Admin configuration already has a well-worn pattern: a `settings(key, value, updated_at)` table (`0003_users_and_owners.sql`), a `settings.get/set` accessor (`src/db/queries.ts`), an admin-gated `src/routes/settings.ts`, and a server-rendered `src/views/settings.eta` with per-setting `<form method="post">` cards. The sync rate-limit card is the direct template for this change.

## Goals / Non-Goals

**Goals:**
- Let an admin choose how many days of initial history Plaid makes available for newly linked accounts (90–730), from the existing `/settings` page.
- Apply that value at link-token creation with a safe default (90) when unset/invalid.
- Reuse the existing settings storage, admin gating, i18n, and card UI patterns exactly.

**Non-Goals:**
- Retroactively deepening history for already-linked items (would require Plaid update-mode re-link per item — out of scope).
- Any change to ongoing/recurring sync, which stays purely cursor-driven.
- Per-user or per-item overrides — this is a single global operator setting.

## Decisions

**Store as a single settings key, validated at write and read.** Add an `INITIAL_HISTORY_DAYS_KEY` constant alongside the existing rate-limit keys. The POST handler validates 90–730 and rejects out-of-range input with a re-rendered error (mirroring sync-limit validation). Consumers also clamp/fallback defensively so a bad or legacy stored value can never break link-token creation.
- *Alternative — env var:* rejected. The whole point is runtime configurability without redeploy; env vars are deploy-time (per `AGENTS.md`).

**Read the setting inside `createLinkToken()`, not at the route.** Keeping the lookup in the Plaid layer means every caller (initial link; the endpoint) gets consistent behavior, and update-mode token creation can deliberately *not* apply it. `createLinkToken()` reads the setting, parses to int, falls back to 90 on any miss, and adds `transactions: { days_requested: N }` to the `LinkTokenCreateRequest`.
- *Alternative — thread the value in as a parameter:* rejected as needless plumbing; the settings accessor is already injectable for tests.

**Validation bounds 90–730.** Plaid's minimum meaningful `days_requested` is 90 and its maximum is 730; enforcing this range keeps requests valid and sets clear UI expectations. Default is 90 (Plaid's own default), so behavior is unchanged until an admin opts into more.

## Risks / Trade-offs

- **Operator expects retroactive effect** → The card's help text (i18n) states explicitly that the value applies to newly linked accounts only and does not backfill existing items.
- **Large `days_requested` slows the first cold-start pull** (more pages) → Acceptable and self-inflicted per-link; ongoing syncs are unaffected. No mitigation needed beyond the documented range.
- **Legacy/garbage value already in the row** → Read-side parse-and-fallback to 90 guarantees a valid request regardless of stored contents.

## Migration Plan

No schema migration — the `settings` table already exists and the feature is additive. Deploy is a normal image build; on rollback the unread key is simply ignored and links revert to the 90-day default. No data backfill.
