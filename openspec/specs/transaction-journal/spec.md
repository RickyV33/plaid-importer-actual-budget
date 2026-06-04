# transaction-journal Specification

## Purpose
TBD - created by archiving change profiles-and-budgets. Update Purpose after archive.
## Requirements
### Requirement: Pulled deltas are persisted to a durable journal

The system SHALL persist every Plaid `/transactions/sync` delta (added, modified, removed) to an append-only `plaid_txn_events` table before the data is delivered to any profile. Each event SHALL record `item_id`, `plaid_account_id`, `event_type` (`added`|`modified`|`removed`), `plaid_txn_id`, an encrypted `payload_enc` (the Plaid transaction JSON, encrypted with `TOKEN_ENCRYPTION_KEY`; null for `removed`), and `pulled_at`. The event `id` SHALL be monotonically increasing and serve as the ordering and watermark key.

#### Scenario: A pull writes events
- **WHEN** a PULL phase retrieves a delta for an item
- **THEN** one `plaid_txn_events` row is appended per added/modified/removed transaction with the payload encrypted at rest

#### Scenario: Cursor advances atomically with the journal append
- **WHEN** the delta is written to the journal during a pull
- **THEN** the item's `cursor` is advanced in the same database transaction, so the cursor and journal can never diverge

### Requirement: Each profile delivers from its own watermark

The system SHALL track per-(profile, item) delivery progress in `profile_item_delivery(profile_id, item_id, last_delivered_event_id)`. A profile's DRAIN SHALL process journal events with `id > last_delivered_event_id` whose `plaid_account_id` is mapped within that profile, in ascending `id` order, and SHALL advance the watermark only after the events are successfully applied to that profile's budget.

#### Scenario: Independent delivery to multiple profiles
- **WHEN** two profiles are connected to the same item and one profile's drain succeeds while the other's budget is unreachable
- **THEN** the succeeding profile advances its watermark, the failing profile's watermark is unchanged, and no additional Plaid pull is made

#### Scenario: Retry after a failure
- **WHEN** a profile whose budget was unreachable drains on a later run
- **THEN** it replays the journal from its unchanged watermark forward, applying added→modified→removed in `id` order, and advances its watermark on success

### Requirement: Late-joining profiles receive future transactions only

The system SHALL initialize a newly attached profile's `last_delivered_event_id` for an item to the current maximum event id for that item, so the profile receives only transactions pulled after it was attached.

#### Scenario: Attaching to an item with prior history
- **WHEN** a Plaid account is attached to a new profile and the item already has journal history
- **THEN** the profile's watermark is set to the current head and it receives only subsequently pulled transactions

### Requirement: The journal auto-prunes delivered events

At the end of each sync, the system SHALL delete `plaid_txn_events` rows whose `id <= MIN(last_delivered_event_id)` across all **active** profiles connected to that item. Removing or disabling a profile, or detaching all of its mapped accounts for an item, SHALL delete the corresponding `profile_item_delivery` row(s) so an inactive profile cannot prevent pruning.

#### Scenario: Steady-state pruning
- **WHEN** every active profile connected to an item has delivered all current events
- **THEN** those events are deleted at the end of the run and the journal returns to empty for that item

#### Scenario: A down profile holds events
- **WHEN** one active profile has not yet delivered events others have
- **THEN** events at or below that profile's watermark are pruned but newer ones are retained until it catches up

#### Scenario: Disabling a profile unblocks pruning
- **WHEN** a profile that was holding events is disabled or detached and its delivery rows are cleared
- **THEN** pruning is computed from the remaining active profiles only and proceeds

