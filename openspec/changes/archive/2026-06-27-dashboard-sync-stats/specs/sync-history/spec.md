## ADDED Requirements

### Requirement: Imported totals are queryable over rolling windows

The system SHALL be able to report the total number of transactions imported by a
given owner over a rolling time window, computed as the sum of
`sync_runs.total_imported` for that owner whose `started_at` falls at or after a
cutoff timestamp. This SHALL be derivable from existing stored runs without a
schema change, and SHALL return zero when the owner has no qualifying runs in the
window.

#### Scenario: Sum over a window

- **WHEN** the total imported is requested for an owner over the last N days
- **THEN** the result is the sum of `total_imported` across that owner's sync runs
  with `started_at` within the last N days

#### Scenario: No runs in the window

- **WHEN** an owner has no sync runs with `started_at` within the requested window
- **THEN** the reported total is zero

#### Scenario: Owner scoping

- **WHEN** totals are requested for one owner
- **THEN** only that owner's sync runs contribute to the sum, and other owners'
  runs are excluded
