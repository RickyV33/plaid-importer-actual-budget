## MODIFIED Requirements

### Requirement: Issue a Plaid Link token on demand

The system SHALL provide an authenticated `POST /link/token` endpoint that calls Plaid's `/link/token/create` with `products=[transactions]`, the configured `PLAID_COUNTRY_CODES`, `PLAID_LANGUAGE`, the configured `PLAID_REDIRECT_URI` (when set), and a `transactions` object whose `days_requested` is the admin-configured initial history window (see the `initial-history-window` capability), falling back to the 90-day default when the setting is unset or invalid, and returns the resulting `link_token` as JSON.

#### Scenario: Link token requested by authenticated user
- **WHEN** an authenticated user POSTs to `/link/token`
- **THEN** the response is 200 with a JSON body `{ "link_token": "<token>" }`, and the underlying `/link/token/create` request included `transactions.days_requested` set to the configured window (or 90 when unset)

#### Scenario: Plaid returns an error
- **WHEN** Plaid's `/link/token/create` returns a non-2xx response
- **THEN** the endpoint responds with 502 and a JSON body identifying the upstream error code without leaking internal context
