## Context

The single-budget assumption is wired into three places: the `ACTUAL_*` env vars ([config.ts:25-28](../../../src/config.ts)), the `withActual` singleton that downloads one budget into one cache dir ([client.ts](../../../src/actual/client.ts)), and `account_mappings` keyed by `plaid_account_id` ([0001_init.sql:28](../../../src/db/migrations/0001_init.sql)). The sync engine pulls from Plaid and imports to Actual in one interleaved pass ([run.ts](../../../src/sync/run.ts)), advancing each item's cursor after a single pull. This change introduces the Profile (a target budget + its connection settings) and makes one Plaid account fan out to many profiles — which forces a rethink of cursors, the Actual client, and mappings. Builds on `multi-user-auth` (profiles are owned by users).

## Goals / Non-Goals

**Goals:**
- One Plaid account can sync into multiple Actual budgets, each with independent target account + pending setting.
- Plaid pull cost stays at **M = number of items per run**, regardless of how many profiles consume each item.
- A budget being unreachable never loses data and never costs an extra Plaid pull.
- Existing single-budget deployments migrate automatically with no re-link.

**Non-Goals:**
- Scheduling (Change C) and home-page UI reorg/styling (Change D).
- Backfilling history into a profile attached after the fact (future-only).
- Concurrency across budgets (the `@actual-app/api` singleton forbids it; drains are sequential).
- Cross-user profile sharing.

## Decisions

**One pull per item into a durable journal; fan-out is local (the cursor decision).**
Plaid's `/transactions/sync` is a consume-once stream keyed by cursor. The cheap-looking "pull once, advance cursor, import to all budgets" is unsafe: if one budget is down after the cursor advances, that budget loses the delta forever. The alternative — a per-(item, profile) Plaid cursor — is safe but multiplies cost by the number of profiles, which the operator explicitly rejected (billing is per-pull). Decision: **PULL** writes the delta to a local append-only journal and advances the item cursor *in the same DB transaction*; **DRAIN** lets each profile apply its slice of the journal independently. Cost stays at M, and a down budget simply retries from the journal next run with no new pull. This is a transactional-outbox pattern.

**Per-profile delivery watermark over the journal, not over Plaid.**
`profile_item_delivery(profile_id, item_id, last_delivered_event_id)` tracks how far each profile has consumed the journal. A profile drains `events WHERE id > watermark AND account ∈ its mappings`, applies the existing `bucketDelta`/`processPromotions`/`processRemovals` lifecycle, then advances its watermark only on success. Ordered replay by monotonic `id` keeps a long-down budget correct (Actual is idempotent on `imported_id`).

**Late-joining profile starts at the journal head.**
When a Plaid account is attached to a new profile, its watermark is initialized to the current `MAX(event id)` for that item — it receives only future transactions. Chosen for zero extra cost and simplicity; historical backfill (full re-pull or retained window) was considered and declined.

**Auto-prune at end of each sync.**
Delete `plaid_txn_events WHERE id <= MIN(last_delivered_event_id)` across **active** profiles connected to that item. In steady state the journal is near-empty (append → drain → prune in one cycle); events only linger for a down budget. Detaching or disabling a profile MUST delete its `profile_item_delivery` rows so an abandoned watermark cannot pin the journal forever.

**Profile holds the full Actual connection, secrets encrypted at rest.**
`profiles`: `name`, `server_url`, `budget_id`, `server_password_enc`, `encryption_password_enc` (nullable). Both secrets are encrypted with the existing `TOKEN_ENCRYPTION_KEY` / `tokens.ts` AES-GCM helper — same trust domain as the Plaid access tokens already stored encrypted. `server_password` feeds `actual.init`; `encryption_password` (when set) feeds `actual.downloadBudget({ password })` — exactly the two-secret split the current code already uses, now per profile.

**Journal payloads are encrypted with `TOKEN_ENCRYPTION_KEY` (item 8).**
Introducing the journal means real transaction data now lives at rest in the importer's DB (today it does not). `plaid_txn_events.payload_enc` stores the encrypted Plaid transaction JSON. This is a *separate* layer from Actual E2E: even when the target budget is E2E-encrypted, the journal is protected by the importer's own key. Reusing `TOKEN_ENCRYPTION_KEY` (vs a new dedicated key) is the same blast radius as the access tokens already in that DB.

**`withActual` becomes per-profile; drains run sequentially.**
`withActual(profileConn, fn)` inits with the profile's server settings, downloads its budget into `data/actual-cache/<profileId>/`, runs `fn`, syncs, shuts down, and wipes the cache dir. The module-global `inFlight` mutex stays — `@actual-app/api` is a process singleton, so the DRAIN phase is a sequential loop over profiles regardless.

**Hostname guardrails.**
`server_url` MUST be `https` and MUST NOT resolve to loopback/private/link-local ranges (e.g. 127.0.0.0/8, 10/8, 172.16/12, 192.168/16, 169.254/16, ::1, fc00::/7). For the trusted-multi-user model this is cheap insurance against a user pointing a profile at internal infrastructure (SSRF).

## Risks / Trade-offs

- **Cache dir holds plaintext budget during a drain** → Per-profile dirs + wipe-after-drain shrink the window to "only during an active sync." Documented as the residual exposure on a shared host; acceptable under the trusted-multi-user threat model. Cannot be eliminated while using `@actual-app/api` (it needs a local plaintext budget).
- **Cursor + journal must commit atomically** → If the cursor advances but the journal append fails (or vice versa), data is lost or double-pulled. Mitigation: write events and advance the cursor in a single SQLite transaction.
- **Abandoned profile pins the journal** → Detach/disable clears delivery rows; prune uses only active profiles.
- **Long-down budget replays redundant intermediate states** → Correct but slightly wasteful; Actual's `imported_id` idempotency makes replays safe.
- **Migration folds a one-to-one table into a composite-key table** → Keep `account_mappings` for one release; back up the DB before deploy (forward-only migrations).

## Migration Plan

1. Ship migration `0004_profiles_and_journal.sql`: create `profiles`, `profile_account_mappings`, `plaid_txn_events`, `profile_item_delivery`. Additive; do not drop `account_mappings`.
2. Boot-time seed (after the `multi-user-auth` seed): if no profiles exist and `ACTUAL_*` env present, create a "Default" profile owned by the admin (encrypt the server + encryption passwords), then for every existing `account_mappings` row insert a `profile_account_mappings` row under Default carrying `actual_account_id` + `pending_visible`. Initialize each profile_item_delivery watermark so existing items continue from their current cursor (journal empty → watermark 0; future pulls flow to Default).
3. Existing item cursors are untouched, so the next sync resumes seamlessly into Default. No re-link, no re-import (Actual idempotent on `imported_id`).
4. Rollback: previous build still reads `account_mappings` and `ACTUAL_*` env. Drop the legacy table in a later cleanup migration once confident.

## Open Questions

- Profile editing of secrets: re-entering vs. leaving blank to keep existing. Lean: blank-keeps-existing (never display stored secrets). Resolve during implementation; not architecture-blocking.
