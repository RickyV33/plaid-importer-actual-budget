## Context

The owner self-hosts Actual Budget at `https://budget.example.com`, behind a private network. Today, transactions land in Actual through manual entry or an aging Node CLI (`source/actualplaid/`) that is awkward to run for an ongoing personal-finance workflow: it uses interactive prompts, depends on deprecated Plaid tiers, has no UI for the recurring "pull new transactions" task, and ships a 16k-line CLI scaffolding most of which does not serve our use case.

The exploration phase (see conversation history) settled three load-bearing questions:

1. **Language**: Go was the original scaffold (chi + html/template), but the Actual Budget API is JavaScript-only — `@actual-app/api` is a CRDT client, not a REST wrapper, and the Actual server exposes no HTTP endpoints for budget operations. A Go implementation would have required either a Node sidecar (two runtimes, JSON contract, two upgrade tracks) or a months-long reimplementation of Actual's sync protocol. Since the owner's motivation for Go was learning rather than fit, and "least architectural overhead" was the stated priority, the project will be pure Node.
2. **Trust boundary**: The app runs on the owner's LAN/Tailnet and only ever performs sync operations from inside that network. Public exposure is not required; the Plaid OAuth redirect URI just needs to be browser-reachable from the linking laptop at link time, which a Tailnet hostname satisfies.
3. **Scope**: v1 is "manual sync only, single user, my Plaid, my Actual." Generalization and scheduled sync are deliberately out of scope but accounted for in the data model so they are additive later.

## Goals / Non-Goals

**Goals:**

- A web app that lists linked Plaid items, their accounts, mapping status, and last sync — visible in one screen.
- A "sync" action that pulls new transactions from selected accounts and pushes them to the mapped Actual accounts in a single click.
- Durable, query-able history of every sync run.
- Single-binary-equivalent deployment via Docker (one image, one container) onto the same unraid host as Actual.
- Operate safely on a private network with minimal auth that still protects against trivial drive-bys (browser tab left open, family member curious clicks).
- A directory structure that holds up if the project doubles in scope.

**Non-Goals:**

- Multi-user, multi-tenant, or shared-budget support.
- Scheduled / cron-style automated sync in v1 (data model leaves room).
- Webhooks from Plaid (cursor-based pull on demand is sufficient).
- Anything beyond `transactions` from Plaid (no auth, balance, identity, investments).
- Per-institution payee or memo cleanup rules. Generic mapping only; institution-specific mappers can be added later.
- Public internet exposure or compliance posture for same.
- Migrating data out of `source/actualplaid/` — there is no shared persistent state.

## Decisions

### D1. Node 22 LTS + TypeScript

Chose **Node over Go**. Driver: `@actual-app/api` is JS-only and embeds a CRDT engine that there is no realistic way to call from Go without a sidecar. The owner's Go preference was learning-driven, not requirements-driven, and was traded for lower architectural overhead.

Chose **TypeScript over plain JS**. Marginal setup cost (a `tsconfig.json` and `tsx`), large refactoring payoff. The existing reference (`source/actualplaid/`) is plain JS — but it is reference, not foundation.

**Alternatives considered:**
- Go + Node sidecar — two runtimes, JSON contract, harder to deploy.
- Go + reimplementing Actual's CRDT sync — multi-month project, ongoing upstream tracking.
- Bun / Deno — too new for the boring-tech bar; offers nothing this project needs.

### D2. Fastify 5 + Eta + HTMX

Chose **Fastify 5** for the HTTP server. Familiar from the reference code, fast, plugin ecosystem covers everything we need (cookies, sessions, static files, form parsing), and has stable conventions.

Chose **Eta** for templating. Closest mental model to Go's `html/template` (string-based, partials, layouts) which the owner already knows. No JSX build step, no component-tree mental overhead.

Chose **HTMX** for interactivity. Form posts return HTML partials; "Sync" replaces a row inline. No SPA, no client-side state.

**Alternatives considered:**
- Hono — newer and pleasant; rejected for "boring tech, well-trodden path" reasons.
- `@kitajs/html` (JSX templates) — type-safe and very nice, rejected because the owner picked Eta in the explore phase for a simpler mental model.
- Plain server-rendered pages with no HTMX — fine, but the "sync this row, update inline" UX is exactly HTMX's strength and costs nothing to add.

### D3. `better-sqlite3` for persistence

Single SQLite database file under `./data/plaid-importer.db`. `better-sqlite3` is synchronous (each call returns directly, no async overhead in code paths that aren't doing I/O) and is the de facto standard in Node for embedded SQLite.

Migrations are hand-rolled SQL files in `src/db/migrations/`, applied at boot by a small runner that tracks applied versions in a `schema_migrations` table. No external migration tool — the scale of this project does not warrant one.

**Alternatives considered:**
- `sqlite3` (async) — extra ceremony, no perceptible benefit at this scale.
- Postgres — overkill for a single-user app; SQLite backup is `cp`.
- Drizzle / Prisma — too much abstraction for a few hundred lines of SQL; raw queries are clearer.

### D4. Plaid cursor-based `/transactions/sync` (not `/transactions/get`)

Use Plaid's cursor sync endpoint. Each `plaid_item` row stores a `cursor`. A sync run pages through `added`/`modified`/`removed` until `has_more=false`, then persists the new cursor. This is Plaid's recommended pattern and avoids the date-window pitfalls the reference code has (which re-fetches a configurable historical window each run).

The first sync of a newly-linked item has an empty cursor, so Plaid returns the full historical window Plaid permits. Subsequent syncs are deltas.

### D5. `@actual-app/api` lifecycle: per-sync init/shutdown, not long-lived

The library wants `init` + `downloadBudget` before use and `sync` + `shutdown` after. The question is how often to do that cycle in a long-running web server.

**Decision: acquire-per-sync.** Each sync run opens, performs all per-account `importTransactions` calls, calls `sync`, then shuts down. The local cache directory persists between runs so subsequent `downloadBudget` calls are incremental (delta sync over the cached state), not full downloads.

**Cost in practice:** first sync after a cold container is a few seconds; subsequent syncs (cache warm on disk) are typically a few hundred milliseconds of init overhead. Manual click-driven UX absorbs this comfortably.

**Alternatives considered and rejected:**

- **B) Long-lived singleton.** `init` once at boot, hold the budget open, `sync` periodically, `shutdown` on SIGTERM. Saves ~200ms per click. Rejected because:
  - Single point of failure: one stuck call wedges every future sync.
  - Requires crash-recovery state machine (what if the Actual server restarts mid-process? what if the local cache becomes inconsistent?).
  - If the Node process is SIGKILLed, we skip the clean shutdown the library expects.
  - The latency it saves is invisible in a manual-click workflow.

- **C) Lazy singleton with idle TTL.** Init on first use, hold open for N minutes of idle, shut down after. A compromise between A and B. Rejected because it's strictly more code than A and only beats A under workloads we don't have (high-frequency scheduled sync). Worth reconsidering if/when scheduled sync runs more often than once an hour.

- **D) Child process per sync.** Spawn a Node subprocess that does init/work/shutdown then exits. Maximally isolated. Rejected as overkill — the in-process per-sync pattern already gives us clean state per invocation without the IPC overhead.

**When to revisit A:**
- Per-click latency feels bad in practice (likely indicates Actual server latency, not init cost — fix upstream).
- Scheduled sync is added at high frequency (e.g. every 5 minutes) and per-run boot cost starts to dominate.
- The library evolves to make singleton use materially safer (e.g. exposes a documented "reload from server" call).

### D6. Single-user auth via env + signed cookie session, applied to every route

`APP_USER` and `APP_PASSWORD` come from env. Login form compares against env (`bcrypt.compare` on a hash computed once at boot). Successful login sets a session cookie signed with `SESSION_SECRET`. `@fastify/session` with `@fastify/cookie` and an in-memory store is sufficient for a single user — the session evaporates on restart, which is fine.

**Every application route requires a valid session.** The auth allowlist is exactly: `GET /login`, `POST /login`, and `/static/*`. No other exceptions.

`/link/oauth-return` is **not** allowlisted. The session cookie is set with `SameSite=Lax`, which permits the browser to send the cookie on top-level GET navigations from third-party sites (including the bank's OAuth completion redirect back to plaid-importer). The session therefore survives the Plaid → bank → plaid-importer round trip.

The one edge case is **session expiry during the OAuth flow** (some banks take 60–90 seconds at their login screen). The auth middleware handles this generically: on a request without a valid session, redirect to `/login?next=<original-url-encoded>`, and on successful login redirect to the `next` URL (validated to be a same-origin path). This pattern applies to OAuth-return like any other authenticated route.

**Alternatives considered:**
- No auth (LAN trust) — vetoed because the app is now publicly accessible behind a reverse proxy.
- Per-user accounts in the DB — premature given the explicit single-user scope.
- Reverse-proxy basic auth only — fine as defense-in-depth, but the app must be safe naked since reverse-proxy config drift is a real failure mode.
- Allowlisting `/link/oauth-return` — rejected after recognizing `SameSite=Lax` keeps the session intact through the OAuth redirect.

### D6a. Rate limiting on `POST /login`

Because the login endpoint is publicly reachable, brute-force attempts are a credible threat. We register `@fastify/rate-limit` and apply a per-IP limit on `POST /login` (default: 5 attempts per minute per IP, configurable via env). Other authenticated routes don't need rate limiting in v1 because a valid session is required to reach them; we can revisit if abusive patterns emerge.

### D7. AES-256-GCM encryption of Plaid access tokens at rest

`TOKEN_ENCRYPTION_KEY` (32-byte key, base64-encoded in env) is loaded at boot. Plaid access tokens (long-lived bank credentials by proxy) are encrypted with AES-256-GCM (12-byte nonce per token, stored alongside the ciphertext) before being written to SQLite, and decrypted on read. This is independent of `SESSION_SECRET` so the two can be rotated with different blast radii.

Implementation lives in `src/crypto/tokens.ts` and is the only module that handles plaintext tokens.

### D8. Manual sync only in v1; schema supports `triggered_by` from day one

`sync_runs.triggered_by` is a TEXT column with values `manual` (v1) and `scheduled` (future). Adding a cron later is purely additive: a scheduled job inserts a `sync_runs` row with `triggered_by='scheduled'` and runs the same orchestrator. No schema change required.

### D9. Directory structure: domains under `src/`, no `internal/`

Node has no `internal/` enforcement, but the *shape* of the proposed structure mirrors what the Go version would have used:

```
src/
├── server.ts         ← fastify bootstrap
├── config.ts         ← env loading (zod)
├── auth/             ← session middleware, login routes
├── crypto/           ← token encryption
├── db/               ← client + migrations + queries
├── plaid/            ← link, sync (cursor)
├── actual/           ← client lifecycle, import
├── sync/             ← orchestration (plaid → mapping → actual → log)
├── routes/           ← HTTP handlers (thin)
└── views/            ← Eta templates
public/               ← static assets (htmx, css)
data/                 ← sqlite + actual cache (gitignored, mounted)
```

Thin routes, fat domain modules. The orchestrator (`src/sync/run.ts`) is where business logic lives; routes do request parsing and rendering only.

### D10. Delete the Go scaffold immediately; delete `source/actualplaid/` at the end

The Go scaffold (`main.go`, `go.mod`, `go.sum`, `handlers/`, `templates/`) is deleted in the first task. `source/actualplaid/` stays as in-repo reference while implementation is in flight (it's the only working example of the Actual lifecycle anywhere on disk) and is deleted once parity is reached.

## Risks / Trade-offs

- **[Risk] `@actual-app/api` schema changes between versions break us silently** → Pin a known-good version in `package.json`. Add an integration smoke test (`npm run smoke`) that exercises init/download/import-noop/sync against a real Actual server.
- **[Risk] Plaid token leak via DB file** → AES-256-GCM at rest with a separate key in env. Token plaintext never touches logs (covered by a Fastify log redaction list).
- **[Risk] OAuth redirect URI mismatch breaks Link** → Make `PLAID_REDIRECT_URI` explicit in `.env.example` with a comment that it MUST exactly match what's registered in the Plaid dashboard. Surface a clear error if Link returns a redirect-related error code.
- **[Risk] Importer runs while user is editing the same account in Actual UI** → `@actual-app/api` handles concurrent edits via CRDT; conflicts resolve. Import is idempotent on Plaid `transaction_id` (passed as `imported_id`).
- **[Risk] First Link of a busy item floods Actual with months of history** → Acceptable. First sync is intentionally bulk; subsequent runs are deltas. UI surfaces "first sync may take a minute" copy.
- **[Trade-off] Per-sync `actual.init` + `shutdown` adds 1–3s of latency** → Acceptable; manual sync is not latency-sensitive. Avoids stateful-singleton failure modes.
- **[Trade-off] Sessions in memory don't survive restarts** → Acceptable for a single user who can re-login in 5 seconds. Avoids a session store implementation.
- **[Trade-off] No webhooks** → User must click sync. Trade is "no public endpoint required" for "no real-time push." Matches the stated UX.

## Migration Plan

This is a greenfield change against an unpushed scaffold with zero commits; there is nothing to migrate.

Deployment plan:

1. Local development: `cp .env.example .env`, fill secrets, `npm install`, `npm run dev`. Plaid sandbox by default.
2. Initial production deploy: build container, deploy to unraid alongside the existing Actual container. Mount `./data/` as a persistent volume.
3. First Link flow: open the app, log in, "Link an account," walk Plaid Link, map accounts in the mapping UI, run first sync.
4. Recurring use: open the app, click "Sync All" (or per-account selection), review the history page.

Rollback: stop the container, delete the volume (loses Plaid item state and sync history; Actual state is untouched because it lives on the Actual server).

## Open Questions

None blocking v1. Items intentionally deferred:

- Scheduled sync interval and UI for it (deferred to a future change).
- Per-institution payee/memo mapping rules (deferred; generic mapper only in v1).
- Multi-user / multi-budget support (out of scope by design).
- Plaid webhook handling for transactions-ready notifications (out of scope).
