## Why

The owner runs a self-hosted Actual Budget instance and currently has no clean way to import transactions from connected bank accounts into it. The existing reference tool (`source/actualplaid/`) is a CLI built on deprecated Plaid tiers, uses an interactive prompt-driven setup that does not fit a long-running self-hosted workflow, and has no friendly UI for the recurring "pull new transactions" task. This change creates a small, focused web app — `plaid-importer` — that lives on the home network alongside the Actual server, connects bank accounts via Plaid, and pushes transactions into Actual on demand.

## What Changes

- Initialize a Node 22 + TypeScript + Fastify 5 web app with Eta templates and HTMX for interactivity.
- Connect bank items via Plaid Link (server-issued link token, public-token exchange, persistent access tokens).
- Persist linked items, accounts, mappings, sync cursors, and sync history in a single SQLite database via `better-sqlite3`.
- Map each Plaid account to an Actual Budget account through a small mapping UI.
- Pull new transactions per item using Plaid's cursor-based `/transactions/sync` endpoint, normalize them, and push them into Actual using `@actual-app/api` (`importTransactions`).
- Provide a "dead simple" home page that lists linked accounts, last-sync status, and per-account sync controls.
- Record every sync run (manual, scoped, success/failure, transactions imported) and surface a history view.
- Single-user password authentication via env-configured username + password, session cookie signed with a separate secret.
- Encrypt Plaid access tokens at rest using a separate env-configured AES-256-GCM key.
- Provide a `.env.example` and document every required environment variable.
- Delete the Go scaffold (`main.go`, `go.mod`, `handlers/`, `templates/`) at the start.
- Keep `source/actualplaid/` as in-repo reference during build; delete it once parity is reached.

## Capabilities

### New Capabilities

- `auth`: Single-user session-based authentication driven by environment variables; gates all routes except the OAuth-return callback and static assets.
- `plaid-link`: Link bank items to plaid-importer using Plaid Link (link token issuance, public-token exchange, persistent storage of access tokens and discovered accounts).
- `account-mapping`: Map each Plaid account to a corresponding Actual Budget account, persisted in SQLite.
- `transaction-sync`: Pull new transactions from Plaid using cursor-based sync and push them to Actual via `@actual-app/api.importTransactions`; manually triggered in v1 with hooks for scheduled triggers later.
- `sync-history`: Record every sync run with its trigger, scope, outcome, and per-account results, and expose a history view in the UI.

### Modified Capabilities

None — this is a greenfield change.

## Impact

- **Code**: Removes the Go scaffold introduced for the abandoned Go direction. Introduces a TypeScript/Node project under `src/` with domain folders (`plaid/`, `actual/`, `sync/`, `routes/`, `auth/`, `db/`).
- **Dependencies (new)**: `fastify`, `@fastify/cookie`, `@fastify/session`, `@fastify/static`, `@fastify/formbody`, `eta`, `better-sqlite3`, `plaid`, `@actual-app/api`, `zod`, `pino`, `bcrypt`, `tsx` (dev), `typescript` (dev).
- **Dependencies (removed)**: `github.com/go-chi/chi/v5` (and the Go module entirely).
- **Runtime**: Node 22 LTS. Single container deployable to the same unraid host as the Actual server.
- **External services**: Plaid (production tier) for the bank side; the user's existing Actual server at `https://budget.example.com` for the budget side.
- **Persistence**: One SQLite file under `./data/plaid-importer.db`. One Actual local-cache directory under `./data/actual-cache/`. Both mounted as a single volume in production.
- **Security**: Plaid access tokens encrypted at rest with AES-256-GCM. Session cookies signed with HMAC. Single-user credential lives in env, not the database.
- **Network**: Publicly accessible via a reverse proxy that terminates TLS and forwards to the container. The public URL serves as `APP_URL` and the base of `PLAID_REDIRECT_URI`, which must be registered exactly in the Plaid dashboard. Because the app is publicly reachable, `POST /login` is rate-limited per IP.
