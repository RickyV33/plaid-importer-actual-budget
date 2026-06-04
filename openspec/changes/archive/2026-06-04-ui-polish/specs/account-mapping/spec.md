## ADDED Requirements

### Requirement: Mapping controls render in consistent aligned columns

The home page SHALL render the "Mapped to" dropdown and the "show pending" toggle in consistent, aligned columns across every account row, regardless of whether the account is currently mapped. The space for the "show pending" control SHALL be reserved on unmapped rows so controls line up vertically across all banks.

#### Scenario: Aligned across mapped and unmapped rows
- **WHEN** the home page renders accounts where some are mapped (showing the pending toggle) and some are not
- **THEN** the "Mapped to" dropdowns align in one column and the "show pending" controls align in one column across all rows

#### Scenario: Consistent across institutions
- **WHEN** accounts from multiple banks/profiles are listed
- **THEN** the mapping and pending controls present in the same aligned layout for every institution
