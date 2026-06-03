## Why

Today the app targets exactly one Actual budget, configured by the `ACTUAL_SERVER_URL`/`ACTUAL_SERVER_PASSWORD`/`ACTUAL_SYNC_ID`/`ACTUAL_ENCRYPTION_PASSWORD` env vars, and each Plaid account maps one-to-one to a single Actual account ([account_mappings PK is `plaid_account_id`](../../../src/db/migrations/0001_init.sql)). To let one Plaid connection feed several budgets — and to let different budgets live on different Actual hosts — the single-budget assumption must be lifted into a first-class **Profile**. A profile is "a target Actual budget plus its connection settings," and a Plaid account can be mapped into many profiles, each with its own settings. This is the core change the whole effort is built around.

## What Changes

- **New `profiles` capability.** A `profiles` table owned by a user: `name`, `server_url` (host), `budget_id` (Actual sync id), `server_password_enc`, and nullable `encryption_password_enc` (Actual E2E password). Secrets are encrypted at rest with the existing `TOKEN_ENCRYPTION_KEY` via [tokens.ts](../../../src/crypto/tokens.ts). This lifts the `ACTUAL_*` env vars into per-profile DB rows; the env vars become seed-only.
- **BREAKING (data model): mappings become per-profile.** Replace `account_mappings` (PK `plaid_account_id`) with `profile_account_mappings` (PK `(profile_id, plaid_account_id)`), each carrying `actual_account_id` and `pending_visible`. One Plaid account fans out to N profiles, each with independent target account and pending setting.
- **Per-profile hostname guardrails (SSRF).** A profile's `server_url` SHALL require `https` and SHALL be rejected if it resolves to a private/link-local/loopback address.
- **Sync engine split into PULL and DRAIN phases.** PULL: exactly one `/transactions/sync` call per item per run (cost stays at M = number of items), persisting the delta to a durable local **journal** and advancing the item cursor in the same DB transaction. DRAIN: each profile connected to that item independently applies its slice of the journal (events past its watermark, filtered to its mapped accounts) into its own budget, reusing the existing pending/promotion/removal lifecycle.
- **New `transaction-journal` capability.** `plaid_txn_events` (append-only delta log, `payload_enc` encrypted with `TOKEN_ENCRYPTION_KEY`) and `profile_item_delivery` (per-(profile,item) watermark). A late-joining profile starts at the journal head (future transactions only). The journal auto-prunes events once every active connected profile has delivered them.
- **Per-profile Actual cache dirs**, wiped after each drain. The cache holds a *plaintext* decrypted budget while a drain runs (verified: local `db.sqlite` is plaintext even for E2E budgets), so the plaintext window is minimized and documented as a known exposure.
- **Migration / auto-seed.** Additive SQL plus a boot-time seed that creates a "Default" profile from the `ACTUAL_*` env vars, claims existing items, and folds every `account_mappings` row into `profile_account_mappings` under Default. Existing item cursors are preserved, so syncing continues seamlessly with no re-link. The old `account_mappings` table is retained for one release for rollback.

## Capabilities

### New Capabilities
- `profile-management`: profile CRUD, encrypted per-profile Actual connection settings (host, budget id, server password, E2E password), hostname guardrails, and attaching/detaching Plaid accounts (with per-profile target account + pending setting) to profiles.
- `transaction-journal`: the durable pull-once delta log, per-profile delivery watermarks, late-join semantics, and auto-pruning.

### Modified Capabilities
- `account-mapping`: mappings move from one-per-Plaid-account to one-per-(profile, Plaid account); the `pending_visible` toggle becomes per-profile.
- `transaction-sync`: cursor advances once per item into the journal; transactions are pushed per profile during a separate drain phase; the Actual lifecycle runs once per profile (not once per run) against per-profile connection settings.

## Impact

- **Schema**: new migration `0004_profiles_and_journal.sql` — create `profiles`, `profile_account_mappings`, `plaid_txn_events`, `profile_item_delivery`; keep `account_mappings` (read-compat for one release).
- **Code**:
  - `src/config.ts` — `ACTUAL_*` become seed-only (still validated for the seed).
  - `src/db/queries.ts` — `profiles`, `profileAccountMappings`, `plaidTxnEvents`, `profileItemDelivery` modules; deprecate direct `accountMappings` use.
  - `src/actual/client.ts` — `withActual` takes per-profile connection settings + a per-profile cache dir; wipe the dir after use. The process-global singleton still forces drains to run sequentially.
  - `src/actual/accounts.ts` — `listAccounts` becomes per-profile (cache keyed by profile).
  - `src/sync/run.ts` — split into a PULL phase (Plaid → journal, per item) and a DRAIN phase (journal → budget, per profile), reusing `src/sync/lifecycle.ts`.
  - New `src/profiles/hostname.ts` — `https`-only + private-range guard.
  - New routes/views for profile management; home view regrouped by profile (UI detail deferred to Change D where noted).
  - `src/crypto/tokens.ts` — reused as-is for profile secrets and journal payloads.
- **Out of scope**: scheduling (Change C), the home-page reorg / select-all / styling (Change D). Cross-user profile sharing. A dedicated journal encryption key (reuses `TOKEN_ENCRYPTION_KEY`). Backfilling historical transactions into a late-joining profile (future-only by decision).
