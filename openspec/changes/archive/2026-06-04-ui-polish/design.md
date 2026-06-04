## Context

Presentation-only cleanup of the home page after `profiles-and-budgets` regroups accounts by profile. Today selection is per-item ([home.eta:50, 127-134](../../../src/views/home.eta)) and the "show pending" toggle renders only when mapped ([home.eta:89-104](../../../src/views/home.eta)), so rows misalign. No backend involved.

## Goals / Non-Goals

**Goals:** a profile-level select-all; consistent alignment of the mapping + pending controls across rows.

**Non-Goals:** any change to selection/mapping/sync behavior, routes, queries, or schema.

## Decisions

- **Profile-scoped select-all** lives in each profile group header and toggles every account checkbox within that profile via a `data-profile-id` selector, mirroring the existing per-item handler pattern. Keep it purely client-side.
- **Alignment via fixed columns**, not conditional layout: always reserve the "show pending" column (render the toggle disabled/hidden-but-spaced when unmapped) so the "Mapped to" select and the toggle line up regardless of mapping state. Done in `style.css`; avoids per-row layout drift.

## Risks / Trade-offs

- **Reserving space for an absent toggle** could look empty on unmapped rows → acceptable; alignment consistency is the goal and the empty slot reads as "not yet mapped."
- **Select-all interaction with profile grouping** → scope the handler by profile id so it never crosses profile boundaries.

## Open Questions

None.
