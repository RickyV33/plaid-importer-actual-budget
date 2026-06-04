# user-management Specification

## Purpose
Defines user accounts, roles, registration (gated by an admin-set secret with first-user bootstrap), and the idempotent environment seed that upgrades an existing single-user deployment into an admin account.

## Requirements
### Requirement: User accounts with roles

The system SHALL store user accounts in a `users` table with a unique `username`, a bcrypt `password_hash`, and a `role` of either `admin` or `member`. Plaintext passwords SHALL NOT be persisted; they SHALL be bcrypt-hashed before storage.

#### Scenario: Creating a user persists a hashed password
- **WHEN** a new user is created with a username and password
- **THEN** the `users` row stores the username and a bcrypt hash, and never the plaintext password

#### Scenario: Usernames are unique
- **WHEN** registration is attempted with a username that already exists
- **THEN** the system rejects it and re-renders the registration form with an error, creating no new user

### Requirement: Registration gated by an admin-set secret

The system SHALL provide `GET /register` (form) and `POST /register` (submission) endpoints. When at least one user exists, registration SHALL require a `registration_secret` field whose value matches the secret stored in the `settings` table. New users created via registration SHALL have role `member`.

#### Scenario: Registration with the correct secret
- **WHEN** at least one user exists and a visitor submits a valid username, password, and the matching registration secret
- **THEN** a new `member` user is created and the visitor is redirected to login (or logged in)

#### Scenario: Registration with a wrong or missing secret
- **WHEN** at least one user exists and the submitted registration secret is missing or does not match
- **THEN** no user is created and the form re-renders with a generic "invalid registration secret" error

### Requirement: First-user bootstrap

The system SHALL allow open registration (no secret required) only while zero users exist, and the first user created this way SHALL be assigned role `admin`. Once any user exists, the registration-secret gate applies to all subsequent registrations.

#### Scenario: First registrant becomes admin
- **WHEN** zero users exist and a visitor registers
- **THEN** the user is created with role `admin` and no registration secret is required

#### Scenario: Gate engages after the first user
- **WHEN** one or more users already exist
- **THEN** `GET /register` shows the registration-secret field and `POST /register` requires it

### Requirement: Admin-managed registration secret

The system SHALL provide an admin-only settings page (`GET /settings`, `POST /settings`) that lets an `admin` view, set, or rotate the registration secret stored in the `settings` table. Users with role `member` SHALL be denied access.

#### Scenario: Admin sets the secret
- **WHEN** an authenticated `admin` submits a new registration secret
- **THEN** the value is stored in `settings` and used to gate subsequent registrations

#### Scenario: Admin views the current secret
- **WHEN** an authenticated `admin` opens the settings page and a registration secret is set
- **THEN** the current secret value is displayed so the admin can copy and share it

#### Scenario: Member denied
- **WHEN** an authenticated `member` requests `GET /settings` or `POST /settings`
- **THEN** the system responds 403 and does not reveal or modify the secret

### Requirement: Idempotent admin seed from environment

On startup, after migrations, the system SHALL create one `admin` user from `APP_USER`/`APP_PASSWORD` if and only if zero users exist and both env values are present. The env password SHALL be bcrypt-hashed. The seed SHALL be a no-op when any user already exists.

#### Scenario: Existing single-user deployment upgrades
- **WHEN** the process boots with `APP_USER`/`APP_PASSWORD` set and the `users` table is empty
- **THEN** one `admin` user is created with the bcrypt hash of `APP_PASSWORD`, and that operator can log in with the unchanged credentials

#### Scenario: Seed is skipped when users exist
- **WHEN** the process boots and at least one user already exists
- **THEN** no user is created or modified regardless of the env values
