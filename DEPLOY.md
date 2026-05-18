# Deploying plaid-importer

Target: Unraid, pulling from a private **Forgejo** container registry at
`code.jankbyrick.com`, reverse-proxied at `plaid-importer.jankbyrick.com`.

The flow:

1. Build the image on your dev machine (`linux/amd64`).
2. Push to Forgejo's OCI-compatible package registry.
3. Pull + run on Unraid, mounting `/app/data` for the SQLite DB and the
   Actual local cache.

---

## 1. One-time prep

### Forgejo token

On `https://code.jankbyrick.com`: **Settings → Applications → Generate New
Token** with the `write:package` and `read:package` scopes. Save it — you
won't see it again. See the
[Forgejo packages docs](https://forgejo.org/docs/next/user/packages/) and
[container registry docs](https://forgejo.org/docs/next/user/packages/container/)
for reference.

### `docker login` on your dev machine

```bash
docker login registry.jankbyrick.com
# Username: <forgejo username>
# Password: <the token you just generated — NOT your account password>
```

### `.env` for local image testing (optional)

```bash
cp .env.example .env
# fill in every variable — see the App / Auth / Plaid / Actual / Storage
# sections of .env.example.
```

---

## 2. Build + push

```bash
npm run deploy            # builds, tags :latest, pushes
npm run deploy:latest     # same, explicit

./deploy.sh v3            # tags :v3 AND :latest, pushes both
```

[deploy.sh](deploy.sh) builds `linux/amd64` via `docker buildx`, pushes to
`registry.jankbyrick.com/rick/plaid-importer` (LAN-only ingress, bypasses
Cloudflare's 100 MB body limit). The image is the same Forgejo package; Unraid
pulls from `code.jankbyrick.com/rick/plaid-importer`.

Override via env vars:

```bash
REGISTRY=code.jankbyrick.com OWNER=rick IMAGE_NAME=plaid-importer ./deploy.sh v3
```

After pushing, the image appears under your Forgejo user's **Packages** tab.

---

## 3. Let Unraid pull from the registry

Two choices:

### Option A — make the package public (easiest)

On Forgejo, open the package → **Settings → Danger Zone → Make Public**.
Unraid pulls without auth.

### Option B — keep it private, log Unraid into the registry

```bash
# ssh into Unraid
docker login code.jankbyrick.com
# forgejo username + token
```

Creates `/root/.docker/config.json`. To persist across Unraid upgrades, add
the same `docker login` to `/boot/config/go`:

```bash
#!/bin/bash
# (existing go file contents...)
docker login code.jankbyrick.com -u <user> -p <token> >/dev/null 2>&1
```

---

## 4. Create the container on Unraid

**Docker → Add Container**:

| Field                         | Value                                                                       |
|-------------------------------|-----------------------------------------------------------------------------|
| Name                          | `plaid-importer`                                                            |
| Repository                    | `code.jankbyrick.com/rick/plaid-importer:latest`                            |
| Network Type                  | `bridge` (or `br0` with a dedicated IP)                                     |
| Port                          | host `8080` → container `8080`                                              |
| Path                          | host `/mnt/user/appdata/plaid-importer` → container `/app/data`             |
| Env `NODE_ENV`                | `production`                                                                |
| Env `APP_URL`                 | `https://plaid-importer.jankbyrick.com` (your public HTTPS URL)             |
| Env `APP_USER`                | the only login username                                                     |
| Env `APP_PASSWORD`            | a strong password                                                           |
| Env `SESSION_SECRET`          | `openssl rand -hex 32`                                                      |
| Env `TOKEN_ENCRYPTION_KEY`    | `openssl rand -base64 32`                                                   |
| Env `PLAID_CLIENT_ID`         | from Plaid dashboard                                                        |
| Env `PLAID_SECRET`            | from Plaid dashboard (production secret)                                    |
| Env `PLAID_ENV`               | `production`                                                                |
| Env `PLAID_COUNTRY_CODES`     | `US`                                                                        |
| Env `PLAID_LANGUAGE`          | `en`                                                                        |
| Env `PLAID_PRODUCTS`          | `transactions`                                                              |
| Env `PLAID_REDIRECT_URI`      | `${APP_URL}/link/oauth-return` — must match Plaid dashboard exactly         |
| Env `ACTUAL_SERVER_URL`       | `https://budget.jankbyrick.com`                                             |
| Env `ACTUAL_SERVER_PASSWORD`  | your Actual server password                                                 |
| Env `ACTUAL_SYNC_ID`          | from Actual → Settings → Advanced → Sync ID                                 |
| Env `ACTUAL_ENCRYPTION_PASSWORD` | only if your budget is e2e-encrypted                                     |
| Env `LOG_LEVEL`               | `info` (or `debug` while shaking it out)                                    |
| Restart policy                | `Unless stopped`                                                            |

Apply. The container boots, runs SQL migrations against
`/app/data/plaid-importer.db`, then starts the server on `:8080`.

The healthcheck (`GET /healthz`) returns 200 once the server is up — Unraid's
container status will reflect health.

Hit `https://plaid-importer.jankbyrick.com` (via your reverse proxy), sign in
with `APP_USER` / `APP_PASSWORD`, link an account, map it, sync.

---

## 5. Reverse proxy

Point Caddy / NPM / SWAG at `http://<unraid-ip>:8080`.

**Caddy** (recommended — zero config):

```
plaid-importer.jankbyrick.com {
    reverse_proxy <unraid-ip>:8080
}
```

**NPM (Nginx Proxy Manager)**:
- Domain: `plaid-importer.jankbyrick.com`
- Forward Hostname: `<unraid-ip>`, Port: `8080`
- Enable: **Block Common Exploits**, **Websockets Support**
- SSL tab: request a Let's Encrypt cert.

The proxy must terminate TLS so the public `APP_URL` is HTTPS. Plaid will
reject the registered redirect URI otherwise.

---

## 6. Updating

```bash
# on dev
npm run deploy v4         # tag + push

# on Unraid
docker pull code.jankbyrick.com/rick/plaid-importer:latest
# then click "Update" or toggle restart on the container
```

The container auto-runs SQL migrations on every boot, so schema changes
converge automatically.

---

## Schema migrations

Migrations are plain SQL files in `src/db/migrations/*.sql`, applied at boot
by `src/db/migrate.ts` (idempotent — already-applied versions are recorded
in the `schema_migrations` table and skipped on subsequent boots).

To add a new migration:

1. Create `src/db/migrations/0002_<name>.sql` with the schema change.
2. Build a new image.
3. Deploy. The next boot applies it.

No data migration framework — keep changes additive where possible
(new columns with defaults, new tables) so they don't require down-time.

---

## Security notes

- **`SESSION_SECRET`** signs session cookies. Rotating it logs everyone out
  (fine for a single-user app).
- **`TOKEN_ENCRYPTION_KEY`** encrypts Plaid access tokens at rest. Rotating
  it makes existing tokens unreadable — you'd need to re-link every bank.
  Treat this as a long-lived secret.
- **`POST /login`** is rate-limited per IP (default 5 attempts per minute).
  Tune via `LOGIN_RATELIMIT_MAX` / `LOGIN_RATELIMIT_WINDOW_MS`.
- The session cookie uses `HttpOnly` + `SameSite=Lax` always, plus `Secure`
  when `NODE_ENV=production`. Don't run prod with `NODE_ENV=development`.
- **`NODE_TLS_REJECT_UNAUTHORIZED=0`** may be useful during dev if your
  Actual server presents a self-signed cert, but **do not ship it to
  production**. Fix the cert chain or use `NODE_EXTRA_CA_CERTS` instead.

---

## Useful scripts

| Command                 | What it does                                              |
|-------------------------|-----------------------------------------------------------|
| `npm run dev`           | tsx-watched dev server on `:8080`                         |
| `npm run build`         | TypeScript build + copy `.eta` views / `.sql` migrations  |
| `npm run start`         | Run the built server from `dist/`                         |
| `npm run migrate`       | Apply migrations against the SQLite DB                    |
| `npm test`              | Unit tests (currently just crypto round-trip + tamper)    |
| `npm run docker:build`  | Build `plaid-importer:local`, linux/amd64                 |
| `npm run docker:run`    | Run local image with `./data` mounted + `.env` loaded     |
| `npm run deploy`        | Build + push to Forgejo (`./deploy.sh`)                   |
| `npm run deploy:latest` | Same, explicit `:latest` tag                              |

---

## Troubleshooting

**`docker login` fails** — use a Forgejo **token**, not your account
password. Account-password login is disabled for the registry.

**"Image not found" on Unraid** — either the package is still private and
Unraid isn't logged in (see §3), or the tag doesn't exist. Check the
Forgejo Packages tab for the actual tag list.

**Container starts but immediately exits with EACCES on `/app/data`** —
the entrypoint chowns `/app/data` at boot, but only if it runs as root.
If you've overridden the image's user, restore the default. Unraid's UI
doesn't override user by default.

**Healthcheck stuck on "starting"** — `GET /healthz` should return 200 in
under a second. If it's still "starting" after a minute, exec into the
container (`docker exec -it plaid-importer sh`) and `wget -O - localhost:8080/healthz`
to see what's actually happening. Most likely cause: a required env var
is missing and the process exited before the healthcheck ran — check
`docker logs plaid-importer`.

**Plaid OAuth bank redirect lands on an error page** — `PLAID_REDIRECT_URI`
must exactly match what's registered in the Plaid dashboard (including
scheme, host, port, and path). Production tier requires HTTPS.

**"Authentication failed: network-failure" from Actual** — the Actual
server isn't reachable from the container (DNS, firewall, or LAN-only
hostname not resolving). Same diagnostic as the dev story: from inside
the container, `wget -O- $ACTUAL_SERVER_URL/account/needs-bootstrap`
should return 200.
