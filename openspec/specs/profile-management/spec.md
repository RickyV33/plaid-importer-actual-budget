# profile-management Specification

## Purpose
TBD - created by archiving change profiles-and-budgets. Update Purpose after archive.
## Requirements
### Requirement: Profiles describe a target Actual budget

The system SHALL store profiles in a `profiles` table owned by a user, each holding a `name`, `server_url`, `budget_id` (Actual sync id), `server_password_enc`, and a nullable `encryption_password_enc`. The two secret columns SHALL be encrypted at rest using `TOKEN_ENCRYPTION_KEY` via the existing AES-GCM helper, and SHALL never be returned to the client in plaintext.

#### Scenario: Creating a profile
- **WHEN** an authenticated user creates a profile with a name, server URL, budget id, and server password (and optionally an encryption password)
- **THEN** a `profiles` row is stored owned by that user with both passwords encrypted at rest

#### Scenario: Secrets are never rendered
- **WHEN** a profile is displayed or edited in the UI
- **THEN** the stored server/encryption passwords are not sent to the browser; leaving a secret field blank on edit keeps the existing value

### Requirement: No duplicate profile for the same budget

The system SHALL reject creating or editing a profile when the same owner already has another profile with the same `server_url` and `budget_id`, to avoid two profiles syncing to the same budget.

#### Scenario: Duplicate budget rejected on create
- **WHEN** a user creates a profile whose `server_url` + `budget_id` match an existing profile they own
- **THEN** the system rejects it with a validation error and stores nothing

#### Scenario: Edit that collides is rejected
- **WHEN** a user edits a profile so its `server_url` + `budget_id` match another profile they own
- **THEN** the system rejects the change and keeps the existing values

#### Scenario: Same budget across different owners is allowed
- **WHEN** two different users each create a profile pointing at the same `server_url` + `budget_id`
- **THEN** both are allowed (the uniqueness is per owner)

### Requirement: New-profile form conveniences

When creating a profile, the system SHALL prefill the server URL from `ACTUAL_SERVER_URL` (if set) and present the server URL and password fields together. The system SHALL provide an endpoint that lists a server's budgets (name → Sync ID) given a server URL and password, and the form SHALL populate a budget dropdown from it — automatically once server details are present, or on demand — with a fallback to manual Sync ID entry if the list cannot be fetched. The server password field SHALL NOT be prefilled with the configured secret (to avoid rendering it into HTML); leaving it blank SHALL use `ACTUAL_SERVER_PASSWORD` (server-side), and the field SHALL block copy/cut. The budget-list endpoint SHALL apply the same https/host guard as profile creation.

#### Scenario: Budgets load from entered server details
- **WHEN** a user provides a valid server URL and password (or leaves the password blank with `ACTUAL_SERVER_PASSWORD` configured) on the new-profile form
- **THEN** the budget dropdown is populated with that server's budgets by name, each carrying its Sync ID as the value

#### Scenario: Budget list unavailable
- **WHEN** the budget list cannot be fetched (server unreachable, busy, bad credentials)
- **THEN** the form lets the user enter the Sync ID manually

#### Scenario: Blank server password uses the configured default
- **WHEN** a user submits the new-profile form with the server password left blank and `ACTUAL_SERVER_PASSWORD` is configured
- **THEN** the profile is created using the configured server password, which is never rendered into the page

### Requirement: Admin can review and remove any profile

The system SHALL provide an admin-only view listing every profile across all users (owner, name, server URL, budget) and an admin-only action to delete any profile. Members SHALL NOT access it.

#### Scenario: Admin lists all profiles
- **WHEN** an `admin` opens the settings page
- **THEN** all users' profiles are listed with their owner, name, and server URL

#### Scenario: Admin removes a profile
- **WHEN** an `admin` deletes any profile from that view
- **THEN** the profile and its mappings/delivery rows are removed (budget data on the Actual server is untouched)

#### Scenario: Member cannot access the admin profile list or delete
- **WHEN** a `member` requests the admin profile list or delete action
- **THEN** the system responds 403

### Requirement: Profiles are owner-scoped

The system SHALL scope all profile operations to the authenticated owner. A user SHALL NOT view, edit, delete, or sync a profile owned by another user.

#### Scenario: Listing profiles
- **WHEN** an authenticated user lists profiles
- **THEN** only profiles they own are returned

#### Scenario: Operating on another user's profile
- **WHEN** a user references a profile id owned by a different user
- **THEN** the system responds 404 and makes no change

### Requirement: Profile server URL guardrails

The system SHALL reject a profile whose `server_url` is not `https`. Additionally, when the operator opts in via `BLOCK_PRIVATE_ACTUAL_HOSTS=true`, the system SHALL reject a `server_url` whose host is — or resolves to — a loopback, private, or link-local address (e.g. `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`). This private-host guard is OFF by default because a self-hosted Actual server is normally reachable only on a private/LAN address.

#### Scenario: Non-https URL rejected
- **WHEN** a user submits a profile with an `http://` server URL
- **THEN** the system rejects it with a validation error and stores nothing

#### Scenario: Private host allowed by default
- **WHEN** a user submits an `https://` profile whose host is a private/LAN address and `BLOCK_PRIVATE_ACTUAL_HOSTS` is not set
- **THEN** the profile is accepted (supports the common self-hosted-on-LAN case)

#### Scenario: Private/loopback host rejected when the guard is enabled
- **WHEN** `BLOCK_PRIVATE_ACTUAL_HOSTS=true` and a user submits a profile whose host resolves to a private or loopback address
- **THEN** the system rejects it with a validation error and stores nothing

#### Scenario: Public https host accepted
- **WHEN** a user submits a profile with an `https://` URL whose host resolves to a public address
- **THEN** the profile is accepted

### Requirement: Attach a Plaid account to a profile with per-profile settings

The system SHALL allow attaching an owned Plaid account to an owned profile, creating a `profile_account_mappings` row keyed by `(profile_id, plaid_account_id)` carrying the target `actual_account_id` and a `pending_visible` flag. Attachment SHALL be selectable per Plaid account: when Plaid connections already exist, the user SHALL be able to choose which subset of their existing accounts to attach to a profile rather than attaching an entire connection wholesale. The same Plaid account MAY be attached to multiple profiles, each with independent target account and `pending_visible` value.

#### Scenario: Selectively attach a subset of existing accounts
- **WHEN** a user creates or edits a profile while one or more Plaid connections already exist
- **THEN** the user can choose which individual accounts to attach, and only the selected `(profile, plaid account)` mappings are created — unselected accounts remain unattached to that profile

#### Scenario: Attach to one profile
- **WHEN** a user maps a Plaid account to an Actual account within a profile
- **THEN** a `profile_account_mappings` row for `(profile, plaid account)` is created with that target and `pending_visible=0`

#### Scenario: Fan-out to multiple profiles
- **WHEN** the same Plaid account is mapped within a second profile
- **THEN** a second independent `profile_account_mappings` row exists; changing one profile's target or pending setting does not affect the other

#### Scenario: Detaching clears delivery state
- **WHEN** a Plaid account is detached from a profile (mapping removed)
- **THEN** that profile no longer receives the account's transactions, and any `profile_item_delivery` row left with no remaining mapped accounts for that item is cleared so it cannot pin the journal

### Requirement: Environment provides optional new-profile defaults

The system SHALL treat `ACTUAL_SERVER_URL` and `ACTUAL_SERVER_PASSWORD` as optional defaults for the New-profile form (URL pre-filled; a blank server password on the form falls back to `ACTUAL_SERVER_PASSWORD`). The system SHALL NOT auto-create any profile from the environment; profiles are created in the UI.

#### Scenario: Server URL prefilled from env
- **WHEN** `ACTUAL_SERVER_URL` is set and a user opens the New-profile form
- **THEN** the server URL field is pre-filled with it

#### Scenario: No profile auto-created
- **WHEN** the process boots with `ACTUAL_*` env set and no profiles exist
- **THEN** no profile is created automatically

