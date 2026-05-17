# plaid-link Specification

## Purpose
TBD - created by archiving change init-plaid-importer. Update Purpose after archive.
## Requirements
### Requirement: Issue a Plaid Link token on demand

The system SHALL provide an authenticated `POST /link/token` endpoint that calls Plaid's `/link/token/create` with `products=[transactions]`, the configured `PLAID_COUNTRY_CODES`, `PLAID_LANGUAGE`, and the configured `PLAID_REDIRECT_URI` (when set), and returns the resulting `link_token` as JSON.

#### Scenario: Link token requested by authenticated user
- **WHEN** an authenticated user POSTs to `/link/token`
- **THEN** the response is 200 with a JSON body `{ "link_token": "<token>" }`

#### Scenario: Plaid returns an error
- **WHEN** Plaid's `/link/token/create` returns a non-2xx response
- **THEN** the endpoint responds with 502 and a JSON body identifying the upstream error code without leaking internal context

### Requirement: Exchange a public token for an access token

The system SHALL provide an authenticated `POST /link/exchange` endpoint that accepts `{ public_token }` in the body, exchanges it via Plaid's `/item/public_token/exchange`, persists the resulting `access_token` (encrypted at rest) and `item_id` in `plaid_items`, fetches the item's accounts via `/accounts/get`, and persists each account in `plaid_accounts` with its `plaid_account_id`, `name`, `mask`, and `type`.

#### Scenario: First-time exchange for a new item
- **WHEN** an authenticated user submits a valid public token for an item not yet linked
- **THEN** the system stores a new `plaid_items` row with encrypted access token, fetches and stores all the item's accounts, and responds with the new item's id and account list

#### Scenario: Re-linking an existing item
- **WHEN** an authenticated user submits a public token for an `item_id` already present in `plaid_items`
- **THEN** the system updates the existing row's access token (re-encrypted) and refreshes the accounts list, preserving existing account mappings keyed by `plaid_account_id`

### Requirement: Handle Plaid OAuth redirect return

The system SHALL provide an authenticated `GET /link/oauth-return` endpoint that re-opens Plaid Link in the user's browser using the original `link_token`, identified by an opaque correlation token issued when the link was initiated. This route is protected by the standard auth middleware; the session cookie is carried back across the bank's OAuth redirect by virtue of `SameSite=Lax`.

#### Scenario: User returns from a bank's OAuth flow with session intact
- **WHEN** Plaid redirects the user's browser to `/link/oauth-return` with a valid session cookie and the correlation token in the query string
- **THEN** the response renders a page that re-opens Plaid Link with the original `link_token`, allowing Link to complete

#### Scenario: User returns from a bank's OAuth flow after session expiry
- **WHEN** Plaid redirects the user's browser to `/link/oauth-return` but the session cookie is missing or expired
- **THEN** the auth middleware redirects to `/login?next=/link/oauth-return%3F<original-query>` and, after successful login, the user is bounced back to the original URL to complete linking

#### Scenario: Correlation token missing or unknown
- **WHEN** the (authenticated) request arrives without a valid correlation token
- **THEN** the response renders an error page explaining that the link session has expired and the user should restart linking

### Requirement: Plaid access tokens are encrypted at rest

The system SHALL encrypt every Plaid `access_token` with AES-256-GCM using the `TOKEN_ENCRYPTION_KEY` environment variable before writing to SQLite, and decrypt on read. The plaintext access token SHALL never appear in logs.

#### Scenario: Persisting an access token
- **WHEN** the system writes a Plaid access token to `plaid_items`
- **THEN** the stored value is AES-256-GCM ciphertext with its nonce, not plaintext

#### Scenario: Reading an access token for use
- **WHEN** the system needs the access token to call Plaid
- **THEN** the value is decrypted in memory, used for the Plaid call, and never written to logs or any other storage

#### Scenario: Decryption failure
- **WHEN** a stored token fails AES-GCM authentication during decryption
- **THEN** the operation fails loudly with an error that identifies the affected item and does NOT silently fall back

### Requirement: Re-authenticate an existing item via Plaid Link update mode

The system SHALL provide a way to re-authenticate a Plaid item whose credentials have lapsed (status `requires_relink`) without removing or recreating the item. Specifically, the server SHALL provide an authenticated `POST /link/items/:itemId/update-token` endpoint that creates a Plaid Link token in update mode by passing the item's existing `access_token`, and an authenticated `POST /link/items/:itemId/mark-active` endpoint that sets the item's status back to `active` after a successful update.

#### Scenario: Generate an update-mode link token
- **WHEN** an authenticated user POSTs to `/link/items/:itemId/update-token` for an existing item
- **THEN** the response is 200 with a JSON body `{ "link_token": "<token>" }`, where the link token was created with `access_token` set so Plaid Link opens directly into the re-authentication flow for that item

#### Scenario: User completes update mode
- **WHEN** an authenticated user finishes the update-mode flow in Plaid Link and the browser POSTs to `/link/items/:itemId/mark-active`
- **THEN** the item's status is set to `active` and the home page renders the item without the "re-link needed" affordance

#### Scenario: Update mode for an unknown item
- **WHEN** an authenticated user requests an update-mode token for an `itemId` not in `plaid_items`
- **THEN** the endpoint responds with 404

### Requirement: Linked items and accounts are discoverable in the UI

The system SHALL provide an authenticated `GET /` route that renders a page listing every linked Plaid item, its institution name, its accounts, each account's mapping status (mapped vs unmapped), and the timestamp of the most recent successful sync.

#### Scenario: No items linked yet
- **WHEN** an authenticated user visits `/` and no items are linked
- **THEN** the page shows an empty-state with a "Link an account" button

#### Scenario: One or more items linked
- **WHEN** an authenticated user visits `/` and items are linked
- **THEN** the page lists items as separate cards, each grouped with its accounts, status badge (`active` or `re-link needed`), last-sync timestamp, a per-item select-all checkbox, and a "Re-link" button when the item status is `requires_relink`

