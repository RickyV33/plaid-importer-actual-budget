## Why

The app is single-user: one credential comes from `APP_USER`/`APP_PASSWORD` env vars, hashed in memory at boot ([credentials.ts](../../../src/auth/credentials.ts)), and every Plaid item is global with no owner. To host the importer for a small, trusted group of people, each person needs their own login and their own private set of Plaid connections. This change introduces real users and an owner boundary; it is the foundation the later profiles, scheduling, and fan-out-sync changes build on.

## What Changes

- **BREAKING (data model):** Introduce a `users` table (id, username, bcrypt `password_hash`, `role` of `admin`|`member`, timestamps). Credentials move from env into the DB; multiple users can exist.
- Add a `settings` table (key/value) to hold the **registration secret** the admin sets.
- Add a `POST /register` flow (and `GET /register` form) gated by the registration secret. **First-user bootstrap:** when zero users exist, registration is open and the first registrant becomes the sole `admin`; once any user exists, the secret is required.
- Add an admin-only settings page (`GET`/`POST /settings`) to set or rotate the registration secret. Non-admins SHALL NOT access it.
- Replace single-credential verification with per-user lookup + bcrypt compare. The session SHALL carry the authenticated `user_id`.
- **Idempotent boot-time seed:** if zero users exist and `APP_USER`/`APP_PASSWORD` are set, seed one `admin` user by bcrypt-hashing the env password — so existing deployments keep their exact current login with no manual step. After the first user exists, the env credential is never consulted again.
- Add a nullable `owner_user_id` column to `plaid_items` and scope all item/account/mapping/history queries to the authenticated user. Users SHALL NOT see each other's data (isolation enforced in queries — "trusted multi-user" threat model).
- `APP_USER`/`APP_PASSWORD` become **seed-only**: required by config validation for backward compatibility, but authoritative state lives in the DB.

## Capabilities

### New Capabilities
- `user-management`: user accounts, roles (admin/member), registration gated by an admin-set secret with first-user bootstrap, and the admin settings page for managing that secret.

### Modified Capabilities
- `auth`: credentials move from a single env pair to per-user DB records with bcrypt; the session carries `user_id`; login validates against the `users` table; the env credential becomes a one-time seed rather than the source of truth.
- `plaid-link`: linked items gain an `owner_user_id`; listing, mapping, and removal SHALL be scoped to the owning user.

## Impact

- **Schema**: new migration `0003_users_and_owners.sql` — create `users`, `settings`; add nullable `plaid_items.owner_user_id` (FK → `users.id`).
- **Code**:
  - `src/auth/credentials.ts` — replace single-credential logic with `users`-table lookup + bcrypt verify; add user creation (registration) and the seed routine.
  - `src/auth/middleware.ts` — add `/register` (GET/POST) to the allowlist; everything else still requires a session.
  - `src/server.ts` — extend `Session` with `userId`; run the idempotent seed after migrations (mirrors current `initCredentials()`).
  - `src/db/queries.ts` — add `users` and `settings` query modules; add `owner_user_id` to `PlaidItemRow`; scope `plaidItems.listAll()` / account / mapping queries by owner.
  - New routes: `src/routes/auth.ts` (register), `src/routes/settings.ts` (admin secret management).
  - New views: `register.eta`, `settings.eta`.
  - `src/config.ts` — keep `APP_USER`/`APP_PASSWORD` (seed-only); document the change.
- **Out of scope** (deferred to later changes): profiles / multi-budget (Change B), scheduling (Change C), UI polish (Change D). Password reset / email flows, multiple registration codes, and per-user admin promotion UI are out of scope for this change.
