## 1. Clear the Go scaffold and bootstrap Node project

- [x] 1.1 Delete the Go scaffold: `main.go`, `go.mod`, `go.sum`, `handlers/`, `templates/`
- [x] 1.2 Add `.gitignore` for `node_modules/`, `data/`, `.env`, `dist/`, `*.log`
- [x] 1.3 Initialize `package.json` with Node 22 engines field, `type: module`, scripts `dev` / `build` / `start` / `migrate` / `smoke`
- [x] 1.4 Add `tsconfig.json` (strict, NodeNext, `outDir: dist`)
- [x] 1.5 Install runtime deps: `fastify`, `@fastify/cookie`, `@fastify/session`, `@fastify/static`, `@fastify/formbody`, `@fastify/rate-limit`, `eta`, `better-sqlite3`, `plaid`, `@actual-app/api`, `zod`, `pino`, `bcrypt`
- [x] 1.6 Install dev deps: `typescript`, `tsx`, `@types/node`, `@types/better-sqlite3`, `@types/bcrypt`
- [x] 1.7 Create empty domain folders under `src/`: `auth/`, `crypto/`, `db/`, `plaid/`, `actual/`, `sync/`, `routes/`, `views/`; plus top-level `public/` and `data/`
- [x] 1.8 Write `.env.example` with every variable from the design (App / Auth / Plaid / Actual / Storage / Optional), including `LOGIN_RATELIMIT_MAX` and `LOGIN_RATELIMIT_WINDOW_MS`, and inline comments noting that `APP_URL` MUST be the public HTTPS URL the reverse proxy serves
- [x] 1.9 Update `README.md`: replace the Go-starter content with setup, env vars, dev workflow, deploy notes

## 2. Configuration and bootstrap

- [x] 2.1 Implement `src/config.ts`: load env via `dotenv` and validate with `zod`; exit non-zero with a clear message when any required var is missing
- [x] 2.2 Implement `src/server.ts`: Fastify instance, pino logger with redaction for `access_token` / `password` / `Authorization`, register `@fastify/cookie`, `@fastify/session`, `@fastify/formbody`, `@fastify/static` (serving `public/`)
- [x] 2.3 Wire the Eta view engine with `views/` and a `layout.eta` shell
- [x] 2.4 Register a global `onRoute` or preHandler that enforces the auth allowlist (login routes, oauth-return, static)
- [x] 2.5 Add `npm run dev` to start `tsx watch src/server.ts`

## 3. Database layer and migrations

- [x] 3.1 Implement `src/db/client.ts`: singleton `better-sqlite3` instance, WAL mode, foreign keys on
- [x] 3.2 Implement `src/db/migrate.ts`: read `src/db/migrations/*.sql` in order, run in a transaction, record applied versions in `schema_migrations`
- [x] 3.3 Write `src/db/migrations/0001_init.sql` with tables: `plaid_items`, `plaid_accounts`, `account_mappings`, `sync_runs`, `sync_account_results`, `schema_migrations`
- [x] 3.4 Wire migration runner into server boot (run before listen())
- [x] 3.5 Implement query helpers per table in `src/db/queries.ts` (typed, hand-rolled — no ORM)

## 4. Token encryption

- [x] 4.1 Implement `src/crypto/tokens.ts`: `encrypt(plain): string` and `decrypt(cipher): string` using AES-256-GCM, 12-byte nonce per call, key from `TOKEN_ENCRYPTION_KEY`
- [x] 4.2 Add boot-time assertion that the key decodes to 32 bytes
- [x] 4.3 Add unit tests for round-trip encrypt/decrypt and for tamper detection (modified ciphertext fails)

## 5. Auth

- [x] 5.1 Implement `src/auth/credentials.ts`: hash `APP_PASSWORD` with bcrypt at boot, expose `verify(username, password)`
- [x] 5.2 Implement `src/auth/middleware.ts`: on unauthenticated request, redirect to `/login?next=<encoded-original-url>` (except for the allowlist: `GET /login`, `POST /login`, `/static/*`)
- [x] 5.3 Implement `src/routes/auth.ts`: `GET /login` (renders form, accepts `next` query param), `POST /login` (validates `next` is a same-origin path, then redirects there on success), `POST /logout`
- [x] 5.4 Configure session cookie flags: `HttpOnly` always, `SameSite=Lax` always, `Secure=true` when `NODE_ENV=production`
- [x] 5.5 Wire `@fastify/rate-limit` and apply to `POST /login` with defaults from env (`LOGIN_RATELIMIT_MAX=5`, `LOGIN_RATELIMIT_WINDOW_MS=60000`)
- [x] 5.6 Add a `login.eta` template with a minimal form (includes hidden `next` field if present in query)
- [x] 5.7 Smoke test: login → home → logout → blocked; deep-link with `?next=` → login → bounced to original; rate-limit kicks in after threshold

## 6. Plaid client and link flow

- [x] 6.1 Implement `src/plaid/client.ts`: configured `PlaidApi` instance for the chosen `PLAID_ENV`
- [x] 6.2 Implement `src/plaid/link.ts`: `createLinkToken()`, `exchangePublicToken(publicToken)`, `fetchAccounts(accessToken)`
- [x] 6.3 Implement `src/routes/link.ts`: `POST /link/token`, `POST /link/exchange`, `GET /link/oauth-return` (all behind standard auth middleware)
- [x] 6.4 Add a "Link an account" button to the home page that triggers Plaid Link in the browser (vanilla Plaid Link JS, no React)
- [x] 6.5 On exchange success: persist `plaid_items` (with encrypted access token), persist `plaid_accounts`, redirect home

## 7. Actual client

- [x] 7.1 Implement `src/actual/client.ts`: a `withActual(fn)` helper that handles `init` + `downloadBudget` + `fn(actual)` + `sync` + `shutdown` with proper try/finally
- [x] 7.2 Implement `src/actual/import.ts`: `mapTransaction(plaidTxn, actualAccountId)` per the table in `transaction-sync` spec, `importBatch(actual, actualAccountId, transactions)`
- [x] 7.3 Implement `src/actual/accounts.ts`: `listAccounts()` using `withActual`
- [x] 7.4 Add a 60s in-memory cache around `listAccounts()` for the mapping UI

## 8. Account mapping

- [x] 8.1 Implement `src/routes/accounts.ts`: `GET /accounts/actual`, `POST /accounts/:plaidAccountId/mapping`, `DELETE /accounts/:plaidAccountId/mapping`
- [x] 8.2 Add a mapping affordance to the home page: per-Plaid-account dropdown of Actual accounts, HTMX-submitted

## 9. Sync orchestration

- [x] 9.1 Implement `src/plaid/sync.ts`: cursor-based `/transactions/sync` paging per item; returns `{ added, modified, removed, nextCursor }`
- [x] 9.2 Implement `src/sync/run.ts`: orchestrator `runSync({ triggeredBy, scope, plaidAccountIds })` that inserts a `sync_runs` row, fetches deltas per item, opens Actual once, imports per mapped account, records per-account results, finalizes the run
- [x] 9.3 Handle `ITEM_LOGIN_REQUIRED`: set `plaid_items.status='requires_relink'`, record per-account result with reason
- [x] 9.4 Implement `src/routes/sync.ts`: `POST /sync` accepting `scope=all` or `scope=selected` + ids
- [x] 9.5 Add a "Sync All" button and per-account checkboxes on the home page; HTMX swap shows running state and final result inline

## 10. History view

- [x] 10.1 Implement `src/routes/history.ts`: `GET /history`
- [x] 10.2 Add `views/history.eta` listing recent runs with expandable per-account results
- [x] 10.3 Add pagination (limit + offset, simple "older" link)

## 11. Containerization

- [x] 11.1 Write `Dockerfile` (multi-stage: build with `tsc`, runtime image with Node 22 slim + `dist/` + `public/` + `src/db/migrations/`)
- [x] 11.2 Write `docker-compose.yml` for local-equivalent deploy on unraid (one service, mounts `./data/`, reads `.env`)
- [x] 11.3 Confirm migrations run on container start
- [x] 11.4 Document a sample unraid deploy in `README.md`

## 13. Re-link flow and grouped home page

- [x] 13.1 Add `createUpdateLinkToken(accessToken)` to `src/plaid/link.ts` (omits `products`, includes `access_token` to put Plaid Link into update mode)
- [x] 13.2 Add `POST /link/items/:itemId/update-token` and `POST /link/items/:itemId/mark-active` to `src/routes/link.ts`
- [x] 13.3 Restructure `views/home.eta` to render one card per Plaid item with a per-item select-all
- [x] 13.4 Add per-item "Re-link" button that opens Plaid Link in update mode and marks the item active on success

## 12. Validate and clean up

- [x] 12.1 Run `npm run smoke` against Plaid sandbox: link the test institution, map accounts, run a sync, view history
- [x] 12.2 Run end-to-end manually against the real Actual server with one bank in production mode
- [x] 12.3 Delete `source/actualplaid/` once parity is confirmed
- [x] 12.4 Final `openspec validate init-plaid-importer --strict` passes
- [x] 12.5 Archive the change once shipped (`openspec archive init-plaid-importer`)
