## ADDED Requirements

### Requirement: Manage-accounts is presented as an icon row action

The Connections page SHALL present the action that opens a connection's
account-selection flow as an icon control consistent with the app's other
icon-driven, hover-revealed row actions, rather than as a text button. The control
SHALL carry an accessible label/title describing its purpose, and SHALL trigger the
existing account-selection flow unchanged. The connection-level unlink action
SHALL remain an icon control alongside it.

#### Scenario: Manage-accounts shows as a labeled icon

- **WHEN** a connection that does not require relinking is rendered in the list
- **THEN** its manage-accounts action appears as an icon control with an
  accessible label, consistent with the row's other icon actions, and activating
  it opens the existing account-selection flow

#### Scenario: Unlink remains an icon beside it

- **WHEN** a connection row is rendered
- **THEN** the unlink action is shown as an icon control alongside the
  manage-accounts icon, and its behavior is unchanged
