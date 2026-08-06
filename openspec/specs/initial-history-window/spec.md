# initial-history-window Specification

## Purpose
TBD - created by archiving change configurable-initial-history. Update Purpose after archive.
## Requirements
### Requirement: Admin configures the initial transaction history window

The system SHALL let an `admin`, on the `/settings` page, configure the initial transaction history depth as a number of days (`days_requested`) to request from Plaid when a new account is linked, stored in the `settings` table under a dedicated key. The value SHALL be validated to Plaid's supported range of 90–730 (inclusive). When the value is unset or not a positive integer within range, the system SHALL treat the window as the default of 90 days. Members SHALL be denied access to view or change it.

#### Scenario: Admin sets a valid window
- **WHEN** an authenticated `admin` submits a value between 90 and 730 on `/settings`
- **THEN** the value is stored in the `settings` table and the `/settings` page reflects the new value on the next render

#### Scenario: Out-of-range value is rejected
- **WHEN** an authenticated `admin` submits a value below 90, above 730, or non-numeric
- **THEN** the system does not store it, re-renders `/settings` with a validation error, and the previously stored value (or default) remains in effect

#### Scenario: Default applies when unset
- **WHEN** no initial-history value has been configured
- **THEN** the system treats the window as 90 days wherever the setting is consumed

#### Scenario: Member cannot configure it
- **WHEN** a `member` attempts to view or change the initial-history setting
- **THEN** the system responds 403 and does not reveal or modify it

#### Scenario: Setting is presented with scope and billing guidance
- **WHEN** an `admin` views the initial-history setting on `/settings`
- **THEN** the card displays localized help text stating that the value applies to newly linked accounts only and that requesting deeper history may carry billing implications depending on the operator's Plaid plan, directing them to their Plaid Dashboard, without asserting any specific fee or amount

### Requirement: Initial history window applies to newly linked accounts only

The configured window SHALL take effect at link-token creation time and govern only how much history Plaid makes available for accounts linked after the value is set. Changing the setting SHALL NOT retroactively deepen history for already-linked items, and SHALL NOT affect stored cursors or ongoing cursor-driven syncs.

#### Scenario: New link uses the current setting
- **WHEN** an admin sets the window to 365 and a user subsequently links a new account
- **THEN** the link-token creation for that account requests 365 days of history from Plaid

#### Scenario: Existing items are unaffected by a later change
- **WHEN** an admin changes the window after items are already linked
- **THEN** those existing items' available history and stored cursors are unchanged, and their next scheduled or manual sync still pulls only the incremental cursor delta
