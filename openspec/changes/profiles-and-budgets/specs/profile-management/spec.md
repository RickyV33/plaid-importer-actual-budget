## ADDED Requirements

### Requirement: Profiles describe a target Actual budget

The system SHALL store profiles in a `profiles` table owned by a user, each holding a `name`, `server_url`, `budget_id` (Actual sync id), `server_password_enc`, and a nullable `encryption_password_enc`. The two secret columns SHALL be encrypted at rest using `TOKEN_ENCRYPTION_KEY` via the existing AES-GCM helper, and SHALL never be returned to the client in plaintext.

#### Scenario: Creating a profile
- **WHEN** an authenticated user creates a profile with a name, server URL, budget id, and server password (and optionally an encryption password)
- **THEN** a `profiles` row is stored owned by that user with both passwords encrypted at rest

#### Scenario: Secrets are never rendered
- **WHEN** a profile is displayed or edited in the UI
- **THEN** the stored server/encryption passwords are not sent to the browser; leaving a secret field blank on edit keeps the existing value

### Requirement: Profiles are owner-scoped

The system SHALL scope all profile operations to the authenticated owner. A user SHALL NOT view, edit, delete, or sync a profile owned by another user.

#### Scenario: Listing profiles
- **WHEN** an authenticated user lists profiles
- **THEN** only profiles they own are returned

#### Scenario: Operating on another user's profile
- **WHEN** a user references a profile id owned by a different user
- **THEN** the system responds 404 and makes no change

### Requirement: Profile server URL guardrails

The system SHALL reject a profile whose `server_url` is not `https` or whose host resolves to a loopback, private, or link-local address (e.g. `127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `169.254.0.0/16`, `::1`, `fc00::/7`).

#### Scenario: Non-https URL rejected
- **WHEN** a user submits a profile with an `http://` server URL
- **THEN** the system rejects it with a validation error and stores nothing

#### Scenario: Private/loopback host rejected
- **WHEN** a user submits a profile whose host resolves to a private or loopback address
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

### Requirement: Default profile is seeded from environment

On startup, after migrations, the system SHALL create a single "Default" profile from the `ACTUAL_SERVER_URL`/`ACTUAL_SERVER_PASSWORD`/`ACTUAL_SYNC_ID`/`ACTUAL_ENCRYPTION_PASSWORD` env vars if and only if no profiles exist and those env values are present. The Default profile SHALL be owned by the seeded admin, and the seed SHALL fold existing `account_mappings` rows into `profile_account_mappings` under it. The seed SHALL be a no-op when any profile already exists.

#### Scenario: Existing single-budget deployment upgrades
- **WHEN** the process boots with `ACTUAL_*` env set and no profiles exist
- **THEN** a "Default" profile is created with encrypted secrets, all existing items are claimable under the admin, and every `account_mappings` row is copied to `profile_account_mappings` under Default preserving `actual_account_id` and `pending_visible`

#### Scenario: Seed skipped when profiles exist
- **WHEN** the process boots and at least one profile already exists
- **THEN** no profile is created or modified, and existing `account_mappings` rows are not re-folded
