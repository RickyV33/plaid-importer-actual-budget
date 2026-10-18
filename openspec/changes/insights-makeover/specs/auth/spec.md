## MODIFIED Requirements

### Requirement: All routes require an authenticated session except an explicit allowlist

The system SHALL install authentication middleware that requires a valid session cookie for every route, with the following exhaustive exceptions: `GET /login`, `POST /login`, `GET /register`, `POST /register`, and static assets under `/static/*`. No other route SHALL be exempt — including `/link/oauth-return`, which relies on `SameSite=Lax` to carry the session cookie through the bank's OAuth redirect. An unauthenticated request to a protected route under `/api/` SHALL receive a `401` JSON response instead of a redirect, so client code can send the viewer to sign in; every other protected route SHALL redirect to the login page.

#### Scenario: Authenticated request to a protected route
- **WHEN** a request with a valid session cookie hits any protected route
- **THEN** the request is handled normally

#### Scenario: Unauthenticated request to a protected route
- **WHEN** a request without a valid session cookie hits any protected route outside `/api/`
- **THEN** the response redirects to `/login?next=<original-path-and-query-url-encoded>`

#### Scenario: Unauthenticated API request
- **WHEN** a request without a valid session cookie hits a protected route under `/api/`
- **THEN** the response is `401` with a JSON body naming the error, and no redirect is issued

#### Scenario: Registration route reachable while logged out
- **WHEN** an unauthenticated request hits `GET /register` or `POST /register`
- **THEN** the auth middleware allows it through (registration is part of the allowlist)

#### Scenario: OAuth-return after the bank redirect, session intact
- **WHEN** Plaid redirects the user's browser to `/link/oauth-return` and the `SameSite=Lax` session cookie accompanies the request
- **THEN** the auth middleware accepts the request and the OAuth-return handler runs normally

#### Scenario: OAuth-return after a session expired mid-OAuth-flow
- **WHEN** Plaid redirects the user's browser to `/link/oauth-return` and the session cookie has expired or is missing
- **THEN** the auth middleware redirects to `/login?next=/link/oauth-return%3F<original-query>` and, after successful login, the user is redirected back to the original `/link/oauth-return` URL with its query intact
