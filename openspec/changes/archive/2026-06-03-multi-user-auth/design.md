## Context

Auth today is a single env-derived credential hashed at boot ([credentials.ts](../../../src/auth/credentials.ts)) and checked against `APP_USER`. The session only stores `authed: boolean` ([server.ts:24-29](../../../src/server.ts)). Plaid items, accounts, mappings, and history are all global rows with no owner. The goal is to host for a handful of trusted people, so we need per-user logins and a private data boundary per user — without breaking the operator's existing single-user deployment.

## Goals / Non-Goals

**Goals:**
- Multiple users, each with their own login and their own (isolated) Plaid connections.
- Registration gated by an admin-set secret, with a sane first-user bootstrap.
- Zero-touch upgrade for the existing single-user deployment (same login keeps working).
- Owner scoping enforced in queries.

**Non-Goals:**
- Profiles / multi-budget (Change B).
- Cross-user sharing of connections or budgets.
- Password reset, email verification, multiple/expiring invite codes, admin UI for promoting users.
- Hardened multi-tenant isolation beyond query scoping (matches the "trusted multi-user" threat model agreed in exploration).

## Decisions

**Registration secret lives in the DB, set by an admin — not an env var.**
A `settings` table holds the current secret. Rationale: lets the admin rotate it from the UI without a redeploy, which fits a hosted-for-friends model. Alternative considered: a static `INVITE_CODE` env var (simpler, no UI) — rejected because rotation requires redeploy and there is no obvious admin owner.

**First-user bootstrap solves the chicken-and-egg.**
If registration requires a secret but only an admin sets it, the first admin can never register. Resolution: when `COUNT(users) == 0`, registration is **open** and the first registrant becomes `admin`. Once any user exists, the secret gate applies. The open window exists only until the very first signup. Alternative: seed the secret from env on first boot — rejected as extra config for no real gain given the auto-seed below.

**Idempotent boot-time seed from env.**
After migrations, if zero users exist and `APP_USER`/`APP_PASSWORD` are present, create one `admin` by bcrypt-hashing the env password (mirrors how `initCredentials()` runs at boot today). This makes the existing deployment upgrade with no manual registration — the operator logs in with the same credentials and is automatically admin. The seed is guarded by the zero-users check, so it never fights the DB on later boots. The env password is bcrypt-hashed once and never stored in plaintext.

**Session carries `user_id`.**
Extend the Fastify `Session` type with `userId`. `authed` stays as a convenience boolean. The auth middleware continues to redirect unauthenticated requests; downstream handlers read `req.session.userId` to scope queries.

**Owner scoping in queries, `owner_user_id` nullable for migration.**
`plaid_items` gets a nullable `owner_user_id`. It is nullable so the additive migration can run before the seed assigns ownership; the seed (and Change B's migration) backfill it to the admin. All item/account/mapping/history reads filter by the requesting user's id. Accounts, mappings, and sync history inherit ownership transitively through their item, so no extra owner columns are needed on those tables.

## Risks / Trade-offs

- **Open registration window before first user** → The window closes permanently after the first signup; for an existing deployment the auto-seed creates the admin at boot, so the window never opens at all.
- **Env credential drift** → After the first user exists, `APP_USER`/`APP_PASSWORD` are ignored for auth. Documented as seed-only to avoid confusion about why changing them does nothing.
- **Query-level isolation only** → A missing `WHERE owner = ?` is a cross-tenant leak. Mitigation: centralize owner-scoped queries in `queries.ts` (no ad-hoc SQL in routes) and cover isolation with a test.
- **Members vs admin** → Only `admin` may manage the registration secret. A member hitting `/settings` gets 403. Single role distinction keeps surface area small.

## Migration Plan

1. Ship migration `0003_users_and_owners.sql`: create `users`, `settings`; add nullable `plaid_items.owner_user_id`. Purely additive.
2. On boot, after `runMigrations()`, run the idempotent seed: zero users + env creds → create admin, then backfill `plaid_items.owner_user_id` to that admin for any null rows.
3. Existing deployment: operator logs in with unchanged credentials, now an admin; their existing items are owned by them.
4. Rollback: the previous build ignores `users`/`settings`/`owner_user_id` and falls back to env auth, so a rollback still authenticates. Keep a DB backup before deploy (SQLite migrations are forward-only).

## Open Questions

- None blocking. (Promotion of additional admins, if ever needed, can be a manual DB update for now.)
