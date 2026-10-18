## MODIFIED Requirements

### Requirement: Mapping controls render in consistent aligned columns

The Profiles page SHALL render each profile's mappings as routing rows grouped by
connection. Each routing row SHALL read as a route from the bank account (name,
mask, and a not-syncing note when deselected) to its destination: the "Mapped to"
Actual account select, followed by the "show pending" switch. On wide screens the
selects SHALL align in one column and the pending switches in another across every
row and every connection group, and the space for the pending switch SHALL be
reserved on unmapped rows so controls line up. On narrow screens the destination
controls MAY stack beneath the account name. Each profile panel SHALL show its
mapping coverage (see sync-insights).

#### Scenario: Aligned across mapped and unmapped rows
- **WHEN** the Profiles page renders accounts where some are mapped (showing the
  pending switch) and some are not, on a wide screen
- **THEN** the "Mapped to" selects align in one column and the "show pending"
  controls align in one column across all rows

#### Scenario: Consistent across institutions
- **WHEN** accounts from multiple banks are listed under a profile
- **THEN** the mapping and pending controls present in the same aligned layout for
  every institution

#### Scenario: Coverage shown per profile
- **WHEN** a profile maps 2 of its 3 syncable accounts
- **THEN** its panel shows "2 of 3 accounts routed" with a matching meter
