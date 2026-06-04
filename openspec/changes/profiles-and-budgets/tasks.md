## 1. Schema

- [x] 1.1 Add migration `src/db/migrations/0005_profiles_and_journal.sql`: create `profiles` (id, owner_user_id FK, name, server_url, budget_id, server_password_enc, encryption_password_enc NULLABLE, created_at, updated_at).
- [x] 1.2 Create `profile_account_mappings` (profile_id FK, plaid_account_id FK, actual_account_id, actual_account_name, pending_visible INTEGER NOT NULL DEFAULT 0, timestamps, PRIMARY KEY (profile_id, plaid_account_id)).
- [x] 1.3 Create `plaid_txn_events` (id INTEGER PK AUTOINCREMENT, item_id, plaid_account_id, event_type, plaid_txn_id, payload_enc NULLABLE, pulled_at) with an index on (item_id, id).
- [x] 1.4 Create `profile_item_delivery` (profile_id, item_id, last_delivered_event_id, PRIMARY KEY (profile_id, item_id)). Do NOT drop `account_mappings`.

## 2. Data access

- [x] 2.1 Add `profiles` query module to `src/db/queries.ts` (create, update, get, listByOwner, count) with `ProfileRow` type; decrypt-on-read helpers for the two secret columns.
- [x] 2.2 Add `profileAccountMappings` module (upsert, setPendingVisible, remove, listByProfile, listByPlaidAccount, listAll) with row type.
- [x] 2.3 Add `plaidTxnEvents` module (appendBatch within a txn that also advances the item cursor, listSinceForItem, pruneDelivered) with row type.
- [x] 2.4 Add `profileItemDelivery` module (getWatermark, setWatermark initialized to head on first attach, deleteForProfileItem, minWatermarkPerItem over active profiles).

## 3. Crypto & hostname

- [x] 3.1 Reuse `src/crypto/tokens.ts` for profile secrets and `payload_enc` (no new key/env var); add thin helpers if useful.
- [x] 3.2 Add `src/profiles/hostname.ts`: validate `server_url` is https and reject loopback/private/link-local hosts (resolve DNS, check ranges). Unit-test the range checks.

## 4. Actual client (per-profile)

- [x] 4.1 Refactor `src/actual/client.ts` `withActual` to accept a per-profile connection (server_url, server password, budget_id, encryption password) and a per-profile cache dir `data/actual-cache/<profileId>`; keep the global `inFlight` mutex (singleton).
- [x] 4.2 Wipe the per-profile cache dir in the `finally` block after each drain.
- [x] 4.3 Make `src/actual/accounts.ts` `listAccounts` per-profile (cache keyed by profile id).

## 5. Sync engine split (PULL / DRAIN)

- [x] 5.1 Extract a PULL phase in `src/sync/run.ts`: for each targeted item, call `syncItem`, append the delta to `plaid_txn_events` and advance the cursor in one DB transaction; classify ITEM_LOGIN_REQUIRED without appending.
- [x] 5.2 Extract a DRAIN phase: for each profile connected to the pulled items, read its journal slice (events > watermark, filtered to its mapped accounts), reuse `bucketDelta`/`processPromotions`/`processRemovals` from `src/sync/lifecycle.ts`, import via per-profile `withActual`, record per-account results, advance the watermark only on success.
- [x] 5.3 Decrypt `payload_enc` back into Plaid `Transaction` objects when building each profile's delta.
- [x] 5.4 After drains, prune the journal: delete events `id <= MIN(watermark)` across active profiles per item; clear delivery rows on detach/disable.
- [x] 5.5 Record `sync_account_results` per (profile, account) and ensure run status aggregates per-profile failures.

## 6. Profile management routes & views

- [x] 6.1 Add `src/routes/profiles.ts`: create/edit/delete profiles (owner-scoped, hostname-guarded, blank-secret-keeps-existing); attach/detach Plaid accounts with target + pending; never echo secrets.
- [x] 6.2 Add `profiles.eta` (list/create/edit) views; register routes in `src/server.ts`.
- [x] 6.3 Update `src/routes/accounts.ts` mapping/pending endpoints to operate on `(profile, plaid account)`.

## 7. Migration seed

- [x] 7.1 Add a boot-time profile seed (after the multi-user-auth seed): if no profiles exist and `ACTUAL_*` env present, create "Default" owned by admin with encrypted secrets, fold every `account_mappings` row into `profile_account_mappings` under Default (preserving actual_account_id + pending_visible), and initialize delivery watermarks so existing item cursors continue seamlessly. Idempotent (no-op when any profile exists).

## 9. Duplicate-profile guard (feedback follow-up)

- [x] 9.1 In `src/routes/profiles.ts` create/edit, reject when the owner already has another profile with the same `server_url` + `budget_id` (add a `profiles.findByOwnerServerBudget` query); surface a clear form error. Cover with a test.

## 8. Tests & docs

- [x] 8.1 Journal tests: atomic pull+cursor append, per-profile watermark advance, down-budget retry without extra pull, late-join starts at head, prune by MIN over active profiles, disable/detach clears delivery rows.
- [x] 8.2 Fan-out test: one item → two profiles → two budgets with independent targets and pending settings.
- [x] 8.3 Hostname guardrail tests (https-only, private-range rejection).
- [x] 8.4 Migration test: existing account_mappings fold into a Default profile; cursor continuity (no re-pull, no duplicate import).
- [x] 8.5 Update `.env.example` / `README` / `DEPLOY.md`: `ACTUAL_*` now seed-only; document profiles, the per-profile plaintext cache-dir exposure, and the journal-at-rest encryption.
