# auth Specification

## Purpose
TBD - created by archiving change init-plaid-importer. Update Purpose after archive.
## Requirements
### Requirement: Per-user credentials in the database

The system SHALL authenticate against user records in the `users` table, comparing the submitted password to the stored bcrypt `password_hash` for the submitted username. The `APP_USER`/`APP_PASSWORD` environment variables SHALL be used only as a one-time seed for the first `admin` (see user-management) and SHALL NOT be the runtime source of truth once any user exists. Plaintext passwords SHALL NOT be stored on disk.

#### Scenario: Login matches a stored user
- **WHEN** the submitted username exists and the password matches that user's bcrypt hash
- **THEN** the credential is accepted

#### Scenario: Unknown username
- **WHEN** the submitted username does not exist in `users`
- **THEN** the credential is rejected and a bcrypt comparison is still performed against a dummy hash to avoid user-enumeration timing differences

#### Scenario: Env credential is seed-only
- **WHEN** at least one user exists and `APP_PASSWORD` is changed in the environment
- **THEN** login behavior is unaffected, because authentication reads only from the `users` table

### Requirement: Login establishes a signed session

The system SHALL provide a `POST /login` endpoint that accepts `username` and `password` form fields, validates them against the `users` table, and on success issues an HTTP-only, SameSite=Lax session cookie signed with `SESSION_SECRET`. The session SHALL carry the authenticated user's `user_id`.

#### Scenario: Successful login
- **WHEN** the submitted username and password match a stored user
- **THEN** the response sets a signed session cookie carrying that user's `user_id` and redirects to `/`

#### Scenario: Failed login
- **WHEN** the submitted credentials do not match any stored user
- **THEN** the response re-renders the login page with a generic "invalid credentials" message and does NOT set a session cookie

#### Scenario: Login form rendered for unauthenticated GET
- **WHEN** an unauthenticated request hits `GET /login`
- **THEN** the response renders the login form

### Requirement: All routes require an authenticated session except an explicit allowlist

The system SHALL install authentication middleware that requires a valid session cookie for every route, with the following exhaustive exceptions: `GET /login`, `POST /login`, `GET /register`, `POST /register`, and static assets under `/static/*`. No other route SHALL be exempt — including `/link/oauth-return`, which relies on `SameSite=Lax` to carry the session cookie through the bank's OAuth redirect.

#### Scenario: Authenticated request to a protected route
- **WHEN** a request with a valid session cookie hits any protected route
- **THEN** the request is handled normally

#### Scenario: Unauthenticated request to a protected route
- **WHEN** a request without a valid session cookie hits any protected route
- **THEN** the response redirects to `/login?next=<original-path-and-query-url-encoded>`

#### Scenario: Registration route reachable while logged out
- **WHEN** an unauthenticated request hits `GET /register` or `POST /register`
- **THEN** the auth middleware allows it through (registration is part of the allowlist)

#### Scenario: OAuth-return after the bank redirect, session intact
- **WHEN** Plaid redirects the user's browser to `/link/oauth-return` and the `SameSite=Lax` session cookie accompanies the request
- **THEN** the auth middleware accepts the request and the OAuth-return handler runs normally

#### Scenario: OAuth-return after a session expired mid-OAuth-flow
- **WHEN** Plaid redirects the user's browser to `/link/oauth-return` and the session cookie has expired or is missing
- **THEN** the auth middleware redirects to `/login?next=/link/oauth-return%3F<original-query>` and, after successful login, the user is redirected back to the original `/link/oauth-return` URL with its query intact

### Requirement: Session cookies are set with secure flags

The session cookie SHALL be issued with `HttpOnly`, `Secure`, and `SameSite=Lax`. `Secure` MAY be relaxed to `false` only in `NODE_ENV=development` to support testing over plain HTTP locally.

#### Scenario: Production cookie flags
- **WHEN** the process runs with `NODE_ENV=production` and a user logs in
- **THEN** the response sets the session cookie with `HttpOnly`, `Secure`, and `SameSite=Lax`

#### Scenario: Development cookie flags
- **WHEN** the process runs with `NODE_ENV=development` and a user logs in
- **THEN** the response sets the session cookie with `HttpOnly` and `SameSite=Lax`; `Secure` may be omitted

### Requirement: Logout clears the session

The system SHALL provide a `POST /logout` endpoint that destroys the current session and redirects to `/login`.

#### Scenario: Logout while authenticated
- **WHEN** an authenticated user POSTs to `/logout`
- **THEN** the session is destroyed and the response redirects to `/login`

### Requirement: Brute-force protection on the login endpoint

The system SHALL apply per-IP rate limiting to `POST /login`. The default limit SHALL be 5 attempts per minute per IP, configurable via environment variables `LOGIN_RATELIMIT_MAX` and `LOGIN_RATELIMIT_WINDOW_MS`.

#### Scenario: Within the limit
- **WHEN** a single IP submits fewer than the configured maximum login attempts within the window
- **THEN** each attempt is processed normally (success or failure as appropriate)

#### Scenario: Limit exceeded
- **WHEN** a single IP exceeds the configured maximum failed login attempts within the window
- **THEN** subsequent `POST /login` requests from that IP receive a 429 response until the window resets

### Requirement: Session secret is configured separately from data encryption

The system SHALL load `SESSION_SECRET` (used to sign session cookies) and `TOKEN_ENCRYPTION_KEY` (used to encrypt Plaid access tokens at rest) as independent environment variables. Neither value SHALL be derivable from the other.

#### Scenario: Either secret missing at boot
- **WHEN** the process starts with `SESSION_SECRET` or `TOKEN_ENCRYPTION_KEY` unset or empty
- **THEN** the process exits with a non-zero status and logs which variable is missing

