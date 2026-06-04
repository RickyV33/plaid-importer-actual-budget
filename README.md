# Plaid Importer for Actual Budget

Self-hosted web app that pulls your bank transactions from
[Plaid](https://plaid.com/) into [Actual Budget](https://actualbudget.org/).

- **Multi-user**: each person has their own private logins and connections.
- **Multi-budget**: a "profile" points at one Actual budget; one bank account
  can feed several profiles at once.
- **Scheduled**: sync on a recurring interval, or on demand.

> **You bring your own Plaid credentials.** This app needs a Plaid `client_id` /
> `secret` with **production access** (Plaid's free tier is sandbox-only).
> Getting production access is between you and Plaid.

## Screenshots

<!-- Drop image/gif files into docs/screenshots/, then uncomment / edit below.
     Basic:        ![Linking a bank](docs/screenshots/link.gif)
     Set a width:  <img src="docs/screenshots/home.png" alt="Home" width="720" /> -->

<!-- ![Home](docs/screenshots/home.png) -->
<!-- ![Syncing](docs/screenshots/sync.gif) -->

## Set up

You need a Docker host, an Actual Budget server, and Plaid production credentials.

1. Copy `.env.example` to `.env` and fill it in: Plaid keys, your Actual server
   URL + password, and two generated secrets (commands are in the file).
2. Run the container (see [DEPLOY.md](DEPLOY.md)) behind an HTTPS reverse proxy.
3. Open the app and **register**; the first account becomes the admin.
4. **Link a bank** (Plaid), create a **profile** for your Actual budget, **map**
   each account to an Actual account, and click **Sync**, or set a schedule.

That's it. Migrations and first-run setup happen automatically on boot.

### Key settings (`.env`)

| Variable | What it does |
| --- | --- |
| `APP_URL` | Public HTTPS URL of the app (also the base of the Plaid OAuth redirect). |
| `PLAID_CLIENT_ID`, `PLAID_SECRET`, `PLAID_ENV` | Your Plaid credentials. Set `PLAID_ENV=production`. |
| `ACTUAL_SERVER_URL` | URL of your Actual server, e.g. `https://budget.example.com`. |
| `ACTUAL_SERVER_PASSWORD` | The Actual server's password (used to log in to it). |
| `ACTUAL_SYNC_ID` | Sync ID of the budget (Actual → Settings → Advanced). |
| `ACTUAL_ENCRYPTION_PASSWORD` | Only if that budget is end-to-end encrypted. |
| `APP_USER`, `APP_PASSWORD` | Seed the first admin account. |
| `SESSION_SECRET` | Signs login cookies (`openssl rand -hex 32`). |
| `TOKEN_ENCRYPTION_KEY` | Encrypts Plaid tokens and profile secrets at rest (`openssl rand -base64 32`). Keep it stable; rotating it makes stored secrets unreadable. |

The `ACTUAL_*` and `APP_USER`/`APP_PASSWORD` values are **seed-only**: on first
boot they create your admin and a "Default" profile, then they're ignored.
After that, manage logins and budgets (profiles) in the app. Full list with
defaults is in [`.env.example`](.env.example).

## How it works

One Plaid pull per connection fans out to every budget that maps it, through a
local encrypted journal, so adding more budgets never costs more Plaid calls.

Full architecture, data model, and security notes:
**[How it works →](https://plop.jankbyrick.com/plaid-importer-mental-model.html)**

## License

[AGPL-3.0](LICENSE). If you run a modified version as a network service, you
must offer its source to users.
