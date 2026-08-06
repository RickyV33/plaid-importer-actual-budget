# app-version-display Specification

## Purpose
Defines how the application determines which version it is running — resolving
`APP_VERSION` from the environment, falling back to the repo-root `VERSION` file
and then to `dev` — how the container image carries that value from its build,
and how the version is surfaced to users beside the title in the top bar.
## Requirements
### Requirement: The application resolves its own version at startup

The application SHALL resolve a single version string once at startup and expose
it to the rest of the application as configuration. Resolution SHALL follow this
precedence:

1. The `APP_VERSION` environment variable, when set to a non-empty value.
2. Otherwise, the contents of the repository-root `VERSION` file, trimmed of
   surrounding whitespace, when that file exists and is non-empty.
3. Otherwise, the literal string `dev`.

Version resolution SHALL NOT prevent the application from starting: an
unreadable or missing `VERSION` file falls through to `dev` rather than raising.

#### Scenario: Environment variable wins

- **WHEN** the application starts with `APP_VERSION` set to `2.8.0`
- **THEN** the resolved version is `2.8.0`, regardless of the contents of any
  `VERSION` file on disk

#### Scenario: Local development falls back to the VERSION file

- **WHEN** the application starts with no `APP_VERSION` set and a repository-root
  `VERSION` file containing `2.8.0` followed by a newline
- **THEN** the resolved version is `2.8.0`, with the trailing newline stripped

#### Scenario: Neither source available

- **WHEN** the application starts with no `APP_VERSION` set and no readable
  `VERSION` file
- **THEN** the resolved version is `dev` and startup proceeds normally

#### Scenario: Empty environment variable is not a version

- **WHEN** the application starts with `APP_VERSION` set to an empty or
  whitespace-only value
- **THEN** resolution continues to the `VERSION` file, and then to `dev`

### Requirement: The container image carries the version it was built from

The container image SHALL accept the version as a build argument and expose it to
the running process as the `APP_VERSION` environment variable, so that a deployed
image reports the version it was built from without the `VERSION` file being
present in the image. When no build argument is supplied, the image SHALL default
to `dev`.

#### Scenario: Image built with an explicit version

- **WHEN** the image is built with the build argument `VERSION=2.8.0`
- **THEN** a container started from that image has `APP_VERSION` set to `2.8.0`
  and reports `2.8.0` as its resolved version

#### Scenario: Image built without a version build argument

- **WHEN** the image is built with no `VERSION` build argument
- **THEN** a container started from that image reports `dev` as its resolved
  version rather than failing to start

### Requirement: Every rendered page displays the running version

Every page rendered through the shared application layout SHALL display the
resolved version in the top bar, beside the application title.

The version SHALL render prefixed with a lowercase `v` when the resolved version
begins with a digit (for example, `v2.8.0`), and verbatim otherwise, so that the
non-numeric fallback reads `dev` rather than `vdev`.

The version SHALL be styled as de-emphasized secondary text, smaller than the
title and baseline-aligned with it, so it reads as a subscript to the title
rather than as a navigation entry. It SHALL NOT be part of the title's link
target, and SHALL follow the project's mobile-first layout conventions.

Because the displayed text is a version number with a single-character prefix, it
is locale-neutral and SHALL NOT require an entry in the message catalog; it SHALL
render identically in every supported locale.

#### Scenario: Version appears on an authenticated page

- **WHEN** an authenticated user views any page rendered through the shared
  layout and the resolved version is `2.8.0`
- **THEN** the top bar shows `v2.8.0` beside the application title

#### Scenario: Version appears before sign-in

- **WHEN** an unauthenticated visitor views the login page and the resolved
  version is `2.8.0`
- **THEN** the top bar shows the same `v2.8.0` beside the title

#### Scenario: The version is not part of the title link

- **WHEN** a user activates the application title in the top bar
- **THEN** the title navigates to the landing route, and the version text is
  outside that link target

#### Scenario: Version display is locale-neutral

- **WHEN** the same page is rendered under the `en` locale and under the `es`
  locale
- **THEN** the version text is identical in both, and no message-catalog lookup
  is performed to produce it

#### Scenario: Unresolved version still renders

- **WHEN** a page is rendered while the resolved version is the fallback `dev`
- **THEN** the top bar reads `dev` — rendered verbatim without the `v` prefix —
  rather than being blank or omitted

