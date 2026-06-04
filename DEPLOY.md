# Running plaid-importer in production

This covers running the app from its prebuilt container image. You need a
container host, an [Actual Budget](https://actualbudget.org/) server, and your
own Plaid **production** credentials.

## HTTPS is expected (Plaid OAuth)

Plaid's OAuth banks redirect back to a **callback URL that must be HTTPS**
(`PLAID_REDIRECT_URI`, normally `${APP_URL}/link/oauth-return`, registered in
your Plaid dashboard). So serve the app over HTTPS.

If the app is **not** reachable over HTTPS, OAuth institutions (most large US
banks: Chase, Bank of America, Wells Fargo, Capital One, etc.) cannot be linked.
Only **non-OAuth** institutions still work: those Plaid links via direct
credential entry (you type the bank username/password into Plaid Link) rather
than redirecting to the bank. Many smaller banks and credit unions fall here.

## Image

```bash
docker pull code.jankbyrick.com/rick/plaid-importer:latest
```

## Configure

Copy `.env.example` to `.env` and fill it in (see the env table in
[README.md](README.md)). At minimum: `APP_URL` (your public HTTPS URL),
`PLAID_*`, `APP_USER` / `APP_PASSWORD`, `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`.

## Run

```bash
docker run -d --name plaid-importer \
  -p 8080:8080 \
  -v "$PWD/data:/app/data" \
  --env-file .env \
  --restart unless-stopped \
  code.jankbyrick.com/rick/plaid-importer:latest
```

- `/app/data` holds the SQLite DB and the Actual cache; keep it on a persistent
  volume.
- The container runs schema migrations on boot, then serves on `:8080`. The
  healthcheck (`GET /healthz`) returns 200 once it's up.
- First boot creates the admin from `APP_USER` / `APP_PASSWORD`; open the app,
  sign in, link a bank, create a profile, map accounts, sync.

### On Unraid

**Docker → Add Container**:

| Field                         | Value                                                                       |
|-------------------------------|-----------------------------------------------------------------------------|
| Name                          | `plaid-importer`                                                            |
| Repository                    | `code.jankbyrick.com/rick/plaid-importer:latest`                            |
| Network Type                  | `bridge` (or `br0` with a dedicated IP)                                     |
| Port                          | host `8080` → container `8080`                                              |
| Path                          | host `/mnt/user/appdata/plaid-importer` → container `/app/data`             |
| Env `NODE_ENV`                | `production`                                                                |
| Env `APP_URL`                 | your public HTTPS URL, e.g. `https://plaid-importer.proxy.com`              |
| Env `APP_USER`                | initial admin username                                                      |
| Env `APP_PASSWORD`            | a strong password                                                          |
| Env `SESSION_SECRET`          | `run command: openssl rand -hex 32`                                                      |
| Env `TOKEN_ENCRYPTION_KEY`    | `run command: openssl rand -base64 32`                                                   |
| Env `PLAID_CLIENT_ID`         | from Plaid dashboard                                                        |
| Env `PLAID_SECRET`            | from Plaid dashboard (production secret)                                    |
| Env `PLAID_ENV`               | `production`                                                                |
| Env `PLAID_REDIRECT_URI`      | `${APP_URL}/link/oauth-return`, must match the Plaid dashboard exactly      |
| Env `ACTUAL_SERVER_URL`       | optional; default Actual server URL the New-profile form pre-fills          |
| Env `ACTUAL_SERVER_PASSWORD`  | optional; default server password used when the form field is left blank    |
| Env `LOG_LEVEL`               | `info` (or `debug` while shaking it out)                                    |
| Restart policy                | `Unless stopped`                                                            |

## Reverse proxy

Put a TLS-terminating reverse proxy (Caddy, Nginx Proxy Manager, Traefik, etc.)
in front so the public `APP_URL` is HTTPS. Configuring that is up to you.

## Security notes

- **`SESSION_SECRET`** signs session cookies. Rotating it logs everyone out.
- **`TOKEN_ENCRYPTION_KEY`** encrypts Plaid access tokens and profile secrets at
  rest. Rotating it makes existing secrets unreadable (you'd re-link banks and
  re-enter profile passwords). Treat it as long-lived.
- **`POST /login`** and **`POST /register`** are rate-limited per IP (default 5
  per minute; tune `LOGIN_RATELIMIT_MAX` / `LOGIN_RATELIMIT_WINDOW_MS`).
- Session cookies are `HttpOnly` + `SameSite=Lax`, plus `Secure` when
  `NODE_ENV=production`. Don't run prod with `NODE_ENV=development`.
- `BLOCK_PRIVATE_ACTUAL_HOSTS=true` rejects profiles pointing at private/loopback
  hosts (off by default, since a self-hosted Actual server is usually on a LAN).
- Don't ship `NODE_TLS_REJECT_UNAUTHORIZED=0`; fix the cert chain or use
  `NODE_EXTRA_CA_CERTS` if your Actual server has a custom CA.

## Troubleshooting

- **Exits with EACCES on `/app/data`**: the entrypoint chowns `/app/data` at
  boot only when it runs as root; restore the image's default user if you
  overrode it.
- **Healthcheck stuck "starting"**: usually a missing required env var; check
  `docker logs plaid-importer`.
- **Plaid OAuth redirect errors**: `PLAID_REDIRECT_URI` must match the Plaid
  dashboard exactly (scheme, host, path) and be HTTPS.
- **"network-failure" from Actual**: the Actual server isn't reachable from the
  container; from inside it, `wget -O- $ACTUAL_SERVER_URL/account/needs-bootstrap`
  should return 200.
