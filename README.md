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

<!-- TODO: drop gifs / screenshots here -->

## Set up

You need a Docker host, an Actual Budget server, and Plaid production credentials.

1. Copy `.env.example` to `.env` and fill it in: Plaid keys, your Actual server
   URL + password, and two generated secrets (commands are in the file).
2. Run the container (see [DEPLOY.md](DEPLOY.md)) behind an HTTPS reverse proxy.
3. Open the app and **register**; the first account becomes the admin.
4. **Link a bank** (Plaid), create a **profile** for your Actual budget, **map**
   each account to an Actual account, and click **Sync**, or set a schedule.

That's it. Migrations and first-run setup happen automatically on boot.

## How it works

One Plaid pull per connection fans out to every budget that maps it, through a
local encrypted journal, so adding more budgets never costs more Plaid calls.

Full architecture, data model, and security notes:
**[How it works →](https://plop.jankbyrick.com/plaid-importer-mental-model.html)**

## License

[AGPL-3.0](LICENSE). If you run a modified version as a network service, you
must offer its source to users.
