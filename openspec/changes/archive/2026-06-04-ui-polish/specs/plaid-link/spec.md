## ADDED Requirements

### Requirement: Profile-scoped select-all on the home page

The home page SHALL provide a "select all" control within each profile group that, when toggled, checks or unchecks every account checkbox belonging to that profile, without affecting checkboxes in other profile groups.

#### Scenario: Select all within a profile
- **WHEN** a user toggles the profile-level "select all" control on
- **THEN** every account checkbox in that profile group becomes checked and checkboxes in other profiles are unchanged

#### Scenario: Deselect all within a profile
- **WHEN** a user toggles the profile-level "select all" control off
- **THEN** every account checkbox in that profile group becomes unchecked
