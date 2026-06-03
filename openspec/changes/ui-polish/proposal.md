## Why

Two small home-page usability issues. (1) Selecting accounts to sync only has a per-item "select all" checkbox ([home.eta:50](../../../src/views/home.eta)); once accounts are grouped by profile there is no quick way to select every account in a profile. (2) The "Mapped to" dropdown and "show pending" toggle render inconsistently across bank rows because "show pending" only appears when an account is mapped, so the controls don't line up. These are presentation-only fixes.

## What Changes

- Add a profile-level "select all" control at the top of each profile group that toggles all of that profile's account checkboxes (in addition to / replacing the current per-item select-all).
- Make the "Mapped to" dropdown and "show pending" toggle visually consistent across rows (right-align or fixed columns) so they line up whether or not an account is mapped.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `plaid-link`: the home view gains a profile-scoped "select all" affordance.
- `account-mapping`: the mapping and pending-visible controls SHALL render in consistent, aligned columns across all account rows.

## Impact

- **Schema**: none.
- **Code**: `src/views/home.eta` (markup + the small client-side select-all handler) and `public/style.css` (column alignment). No route or query changes.
- **Depends on**: `profiles-and-budgets` (the home page is grouped by profile, which is what "select all for a profile" operates over).
- **Out of scope**: any behavioral change to mapping, syncing, or selection semantics beyond the checkbox convenience and visual alignment.
