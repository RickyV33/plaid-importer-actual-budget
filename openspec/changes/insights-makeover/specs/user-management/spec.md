## MODIFIED Requirements

### Requirement: Admin-managed registration secret

The system SHALL provide an admin-only settings page at `/settings` that lets an `admin` view, set, or rotate the registration secret stored in the `settings` table. The page reads the secret through `GET /api/settings` and changes it through `PUT /api/settings/registration-secret`. Users with role `member` SHALL be denied: both endpoints SHALL respond 403 to them, the secret SHALL NOT be sent to them, and the Settings tab SHALL NOT be shown to them.

#### Scenario: Admin sets the secret
- **WHEN** an authenticated `admin` submits a new registration secret
- **THEN** the value is stored in `settings` and used to gate subsequent registrations

#### Scenario: Admin views the current secret
- **WHEN** an authenticated `admin` opens the settings page and a registration secret is set
- **THEN** the current secret value is available on the page (hidden until revealed) so the admin can copy and share it

#### Scenario: Member denied
- **WHEN** an authenticated `member` requests `GET /api/settings` or `PUT /api/settings/registration-secret`
- **THEN** the system responds 403 and does not reveal or modify the secret
