# app-notifications Specification

## Purpose
Defines the app-wide dismissable banner system for surfacing one-time notices to authenticated users.

## Requirements

### Requirement: App-wide dismissable banners shown to authenticated users

The system SHALL support a set of named banners (identified by a string key) that appear in the layout for all authenticated pages. Each banner is either active or inactive based on server-side configuration. A banner is shown to a user until they dismiss it.

#### Scenario: Active banner appears on all authed pages
- **WHEN** an authenticated user loads any page and has not dismissed a currently active banner
- **THEN** the banner is rendered between the topbar and main content

#### Scenario: Dismissed banner never reappears
- **WHEN** an authenticated user dismisses a banner
- **THEN** the banner is never shown to that user again, across sessions and devices

#### Scenario: Inactive banner key is never shown
- **WHEN** a banner key is removed from the server's active set
- **THEN** no user sees it, regardless of their dismissal record

### Requirement: Banner dismissal is persisted per user in the database

The system SHALL store banner dismissals in a `dismissed_banners` table keyed by `(user_id, banner_key)`. Dismissal is triggered by `POST /banners/:key/dismiss` and requires authentication. The response SHALL allow the client to hide the banner without a page reload.

#### Scenario: Dismissal stored on POST
- **WHEN** an authenticated user POSTs to `/banners/:key/dismiss`
- **THEN** a row is inserted (or ignored if duplicate) in `dismissed_banners` and the server returns 204

#### Scenario: Unauthenticated dismiss is rejected
- **WHEN** an unauthenticated request POSTs to `/banners/:key/dismiss`
- **THEN** the request is redirected to `/login` (per the app-wide auth guard) and no row is inserted

### Requirement: Schedule migration banner notifies users of legacy schedules

The system SHALL include a banner with key `"schedule_migration_v1"` in the active set. Its message SHALL inform users that the schedule format has been updated and any previously created schedules must be recreated or edited using the new format.

#### Scenario: Migration banner shown to users with legacy schedules
- **WHEN** an authenticated user with at least one legacy schedule (interval_hours IS NOT NULL) loads any page and has not dismissed the banner
- **THEN** the migration banner is visible

#### Scenario: Migration banner dismissal is one-and-done
- **WHEN** a user dismisses the migration banner
- **THEN** it does not reappear even if legacy schedules still exist
