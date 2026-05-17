# plaid-importer

A small self-hosted web app that imports transactions from your bank accounts
(via Plaid) into your self-hosted [Actual Budget](https://actualbudget.org/)
server. Single user, simple UX: link an account, map it to an Actual account,
click "Sync."

## Setup

Requires Node 22+.

```sh
cp .env.example .env
# fill in PLAID_*, ACTUAL_*, APP_*, SESSION_SECRET, TOKEN_ENCRYPTION_KEY
npm install
npm run dev
```

Generate the required secrets:

```sh
openssl rand -hex 32     # SESSION_SECRET
openssl rand -base64 32  # TOKEN_ENCRYPTION_KEY
```

Visit `http://localhost:8080` and log in with the credentials from `.env`.

### First-run walkthrough

1. Click **Link an account** → Plaid Link opens. For sandbox, pick any bank and
   use the test credentials `user_good` / `pass_good`.
2. After Link closes, the page reloads and the account shows up. Use the
   **Mapped to** dropdown to map it to an Actual account. (The dropdown
   takes a couple of seconds to populate the first time — that's the
   Actual client downloading your budget.)
3. Click **Sync all** to pull transactions and push them to Actual.
4. Click **History** in the top nav to see the run and per-account results.

### Troubleshooting

| Symptom | What it means |
| --- | --- |
| `Invalid environment configuration` at boot | An env var is missing — the message names which one |
| `TOKEN_ENCRYPTION_KEY must decode to 32 bytes` | Regenerate with `openssl rand -base64 32` |
| Login page works, click goes nowhere | Check the terminal — the dev server logs every request |
| "Could not reach Actual" warning on home page | Wrong `ACTUAL_SERVER_URL` / password / sync ID, or the Actual server is down |
| Plaid Link won't open | Check `PLAID_CLIENT_ID` / `PLAID_SECRET` and that `PLAID_ENV` matches the secret tier |
| Mapping dropdown is empty | Actual returned zero accounts, or it's not reachable |
| OAuth bank link redirects but the page errors | `PLAID_REDIRECT_URI` must exactly match what's registered in your Plaid dashboard |

## How it talks to Actual

The Actual Budget API is a JavaScript library (`@actual-app/api`), not a REST
API. This app talks to your Actual server through that library, which means
each sync:

1. Initializes the Actual client and downloads (or incrementally syncs) the
   budget to a local cache under `ACTUAL_CACHE_DIR`.
2. Calls `importTransactions` per mapped account.
3. Syncs back to the Actual server and shuts the client down.

The local cache directory should be persisted between runs (it lives under
`./data/` by default, which is volume-mounted in production).

## How Plaid linking works

This app uses the Plaid Link flow:

1. The browser opens Plaid Link via a server-issued `link_token`.
2. You pick a bank and authenticate.
3. For OAuth banks (Chase, BoA, etc), Plaid redirects you to the bank, you
   log in there, then the bank redirects you back to
   `${APP_URL}/link/oauth-return`. **This URL must be registered exactly as
   `PLAID_REDIRECT_URI` in the Plaid dashboard.**
4. On success, the public token is exchanged for a long-lived access token,
   which is encrypted at rest with `TOKEN_ENCRYPTION_KEY`.

## Deploy

Designed to run in a container behind a reverse proxy that terminates TLS.

Switch these in `.env` for production:

```bash
NODE_ENV=production
APP_URL=https://plaid-importer.your-public-domain.com
PLAID_ENV=production
PLAID_SECRET=<production secret from Plaid dashboard>
PLAID_REDIRECT_URI=https://plaid-importer.your-public-domain.com/link/oauth-return
```

Register that exact `PLAID_REDIRECT_URI` in the Plaid dashboard *before*
linking an OAuth bank (Chase, BoA, etc).

```sh
docker compose up -d --build
```

`./data/` is volume-mounted into the container at `/app/data` — it holds the
SQLite database and the Actual local cache. The container binds to
`127.0.0.1:8080` by default; expose it to your network via your reverse
proxy of choice (Caddy / Traefik / nginx).

### Unraid notes

Create an Unraid container with:

- **Repository**: `plaid-importer:latest` (build locally and tag, or push to a
  registry)
- **Network**: bridge
- **Port mapping**: container `8080` → host `8080` (or whatever your reverse
  proxy expects)
- **Volume**: host path of choice → `/app/data` (this is the only thing that
  needs to persist; everything else is in the image)
- **Environment variables**: every variable from `.env.example`

Point your reverse proxy at the host port. Make sure the public URL you serve
matches `APP_URL` and `PLAID_REDIRECT_URI` exactly, and that the redirect URI
is registered in the Plaid dashboard.

### Tests

```sh
npm test       # unit tests (crypto)
npm run smoke  # placeholder for end-to-end smoke (Plaid sandbox)
```

## Project layout

```
src/
├── server.ts         Fastify bootstrap
├── config.ts         env loading + validation
├── auth/             session middleware, login
├── crypto/           AES-256-GCM for Plaid tokens at rest
├── db/               better-sqlite3 + migrations
├── plaid/            Plaid client, link, cursor sync
├── actual/           @actual-app/api lifecycle + import
├── sync/             orchestrator: plaid → mapping → actual → log
├── routes/           HTTP handlers (thin)
└── views/            Eta templates
public/               static assets (css)
data/                 sqlite + actual cache (gitignored, volume-mounted)
```
