## 1. Schema

- [x] 1.1 Add migration `src/db/migrations/0003_users_and_owners.sql`: create `users` (id, username UNIQUE, password_hash, role CHECK in ('admin','member'), created_at, updated_at) and `settings` (key PRIMARY KEY, value, updated_at).
- [x] 1.2 In the same migration, add nullable `owner_user_id` to `plaid_items` (FK → `users.id`) and an index on it.

## 2. Data access

- [x] 2.1 Add a `users` query module to `src/db/queries.ts` (create, getByUsername, getById, count, listAll) plus a `UserRow` type.
- [x] 2.2 Add a `settings` query module (get(key), set(key, value)) plus typed accessor for the registration secret.
- [x] 2.3 Add `owner_user_id` to `PlaidItemRow`; add owner-scoped variants of `plaidItems.listAll`, account, mapping, and history reads so routes never query unscoped.

## 3. Credentials & seed

- [x] 3.1 Rewrite `src/auth/credentials.ts`: `verify(username, password)` looks up the user and bcrypt-compares; compare against a dummy hash on unknown username to avoid timing enumeration. Add `createUser(username, password, role)`.
- [x] 3.2 Add an idempotent boot seed (in `credentials.ts` or a new `src/auth/seed.ts`): if `users` count is 0 and `APP_USER`/`APP_PASSWORD` are set, create an `admin`; then backfill any null `plaid_items.owner_user_id` to that admin. Call it from `main()` after `runMigrations()` in `src/server.ts`.

## 4. Sessions & middleware

- [x] 4.1 Extend the Fastify `Session` declaration in `src/server.ts` with `userId?: number`; keep `authed`.
- [x] 4.2 Add `GET /register` and `POST /register` to the allowlist in `src/auth/middleware.ts`.
- [x] 4.3 Add a helper to resolve the current user from `req.session.userId` and a guard that requires `role === 'admin'`.

## 5. Registration

- [x] 5.1 Add `register.eta` view (username, password, and a registration-secret field shown only when users already exist).
- [x] 5.2 Add `POST /register` to `src/routes/auth.ts`: enforce first-user bootstrap (open + admin when zero users), otherwise require the stored registration secret; reject duplicate usernames; create a `member`; redirect to login on success.
- [x] 5.3 Update `POST /login` to set `req.session.userId` (and `authed`) from the matched user.

## 6. Admin settings

- [x] 6.1 Add `settings.eta` view for setting/rotating the registration secret.
- [x] 6.2 Add `src/routes/settings.ts` with `GET`/`POST /settings`, admin-guarded (403 for members); register it in `src/server.ts`. Add a link to it in the layout for admins only.

## 7. Owner scoping in routes

- [x] 7.1 Update `src/routes/home.ts`, `accounts.ts`, `link.ts`, `history.ts`, and `sync.ts` to use owner-scoped queries keyed by `req.session.userId`; cross-owner references return 404 / are omitted from sync targeting.

## 8. Tests & docs

- [x] 8.1 Unit tests: `verify` (match, wrong password, unknown user timing path), seed idempotency, first-user-bootstrap vs secret-gated registration.
- [x] 8.2 Isolation test: user B cannot see or operate on user A's items/accounts/mappings/history.
- [x] 8.3 Update `.env.example` / `README` to note `APP_USER`/`APP_PASSWORD` are now seed-only and document the registration secret + first-user bootstrap.
