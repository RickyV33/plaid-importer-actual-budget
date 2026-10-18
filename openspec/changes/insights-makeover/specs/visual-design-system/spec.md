## ADDED Requirements

### Requirement: Pages share one token-based visual system

Every page rendered through the shared layout SHALL be styled by a single
stylesheet whose colors are defined as named tokens, with a light and a dark set.
Headlines SHALL use Playfair Display, body text DM Sans, and eyebrow labels, tab
labels and other small caps-style labels DM Mono, each with a system fallback.
Font files SHALL be served by the application itself; pages SHALL NOT request
fonts from a third-party host. Gradients SHALL appear only as backgrounds; text,
borders, buttons, and data marks SHALL use solid colors. Icons SHALL be SVG.
The UI SHALL NOT use emoji as icons, bullets, or decoration.

#### Scenario: Fonts are self-hosted
- **WHEN** any page loads
- **THEN** its font files are requested from the application's own origin

#### Scenario: Data marks use solid colors
- **WHEN** a page shows a bar list, column chart, or meter
- **THEN** each fill is a single solid token color

### Requirement: Light and dark themes with a remembered choice

The application SHALL offer a light and a dark theme. Until the viewer chooses,
the theme SHALL follow the operating system's color-scheme preference. A header
control SHALL switch themes; the choice SHALL be remembered in the viewer's
browser and applied before the page first paints, so a dark-mode viewer never
sees a light flash. If browser storage is unavailable the switch SHALL still work
for the current page.

#### Scenario: Follows the OS by default
- **WHEN** a viewer with an OS dark preference and no saved choice opens a page
- **THEN** the page renders in the dark theme

#### Scenario: Choice is remembered
- **WHEN** a viewer switches to light and later opens another page
- **THEN** that page renders in the light theme from first paint

#### Scenario: Storage blocked
- **WHEN** browser storage throws on read or write
- **THEN** the page still renders in the OS theme and the switch still changes the
  current page's theme

### Requirement: Application shell with header tools and a tab strip

The shared layout SHALL render a header with the application title and its
version on one side and header tools on the other: the theme switch, the
language picker, and (when signed in) sign-out. Below it, signed-in viewers SHALL
see a tab strip of the primary pages in which the current page is visually marked
and exposed with `aria-current="page"`. On narrow screens the tab strip SHALL
scroll horizontally rather than wrap. Signed-out pages (sign-in, register) SHALL
show the header with the theme switch and language picker but no tab strip.

#### Scenario: Current page is marked
- **WHEN** a signed-in viewer opens the History page
- **THEN** the History tab is marked as current and carries `aria-current="page"`

#### Scenario: Sign-in page shell
- **WHEN** a signed-out viewer opens the sign-in page
- **THEN** the header shows the theme switch and language picker, and no tab strip

### Requirement: Every page and panel opens with a heading and a purpose line

Each page SHALL open with an intro: a short eyebrow label, a headline, and a
one-line description of what the page is for, with page-level actions beside it.
Each panel SHALL open with a heading and, where its purpose isn't obvious, a
one-line description. Empty data SHALL render a calm empty state that says what
is missing and, where an action fixes it, offers that action.

#### Scenario: Page intro
- **WHEN** a signed-in viewer opens any primary page
- **THEN** the page begins with an eyebrow, a headline, and a one-line description

#### Scenario: Empty panel
- **WHEN** a panel has no data to show
- **THEN** it shows a short muted sentence instead of an empty chart or table

### Requirement: Data marks carry their numbers as text

Bar lists, column charts, and meters SHALL never be the only carrier of a value:
each bar row SHALL show its value (and share, where meaningful) as text; each
meter SHALL have its figures written next to it; each column of a column chart
SHALL be keyboard-focusable and reveal its date and value in a tooltip, and the
chart SHALL include an equivalent text table for assistive technology. One series
SHALL use one color.

#### Scenario: Bar row shows value and share
- **WHEN** a bar list renders
- **THEN** each row shows its label, its value, and its share of the total as text

#### Scenario: Column is reachable by keyboard
- **WHEN** a keyboard user tabs into a column chart
- **THEN** each focused column shows its date and value

### Requirement: List rows are calm at rest with icon actions on demand

Rows in lists of user-managed things SHALL render without visible per-row
action buttons at rest and SHALL reveal them on hover or keyboard focus within
the row (connections' accounts, profiles, schedules, admin profile list). The
revealed actions SHALL be icon buttons with accessible names and SHALL include
edit and delete wherever the row's entity supports them. On devices without
hover, row actions SHALL stay visible.

#### Scenario: Actions appear on focus
- **WHEN** a keyboard user moves focus into a schedule row
- **THEN** that row's toggle, edit, and delete icon buttons become visible

#### Scenario: Touch devices
- **WHEN** the device reports no hover capability
- **THEN** row actions are visible without hover

### Requirement: Motion is optional and respects reduced-motion

Animations SHALL be skipped when the viewer prefers reduced motion, showing
final values immediately. Within that limit, hero figures may count up from zero
once on load, bar and column fills may grow in, and page changes may fade.

#### Scenario: Reduced motion
- **WHEN** a viewer with `prefers-reduced-motion: reduce` opens the overview
- **THEN** the hero figure shows its final value immediately with no animation

### Requirement: Layout is mobile first and flexbox first

Styles SHALL be written for the smallest viewport first, with wider layouts
layered on through `min-width` media queries. Layout SHALL use flexbox, using
grid only where a layout is genuinely two-dimensional. No page SHALL scroll
horizontally at a 360px viewport except inside an explicitly scrollable region
(the tab strip, a wide table).

#### Scenario: Narrow viewport
- **WHEN** any page is viewed at 360px wide
- **THEN** the page body does not scroll horizontally and metric cards stack in a
  single column
