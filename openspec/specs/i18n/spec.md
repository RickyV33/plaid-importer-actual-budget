# i18n Specification

## Purpose
TBD - created by archiving change ui-polish. Update Purpose after archive.
## Requirements
### Requirement: User-facing strings come from a message catalog

The system SHALL keep all user-facing strings in a single message catalog with at least `en` and `es` locales, keyed by stable identifiers. Templates and client-side scripts SHALL render text via a `t(key, params?)` lookup rather than hardcoded literals. `en` SHALL be the fallback when a key is missing in the active locale.

#### Scenario: Localized render
- **WHEN** a page is rendered for a request whose locale resolves to `es`
- **THEN** user-facing strings are taken from the `es` catalog, falling back to `en` for any missing key

#### Scenario: Missing key falls back
- **WHEN** a `t(key)` lookup has no entry in the active locale and none in `en`
- **THEN** the system returns the key itself (so nothing renders blank) rather than throwing

### Requirement: Locale is resolved from the request

The system SHALL resolve the active locale from the request's `Accept-Language` header, choosing the best match among supported locales (`en`, `es`) and defaulting to `en`.

#### Scenario: Spanish preferred
- **WHEN** a request sends `Accept-Language: es-ES,es;q=0.9`
- **THEN** the active locale is `es`

#### Scenario: Unsupported language defaults to English
- **WHEN** a request sends an `Accept-Language` with no supported match (or none at all)
- **THEN** the active locale is `en`

