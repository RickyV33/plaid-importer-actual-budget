## MODIFIED Requirements

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
