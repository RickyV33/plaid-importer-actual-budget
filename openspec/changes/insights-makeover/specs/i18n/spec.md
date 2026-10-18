## MODIFIED Requirements

### Requirement: Locale is resolved from the request

The system SHALL resolve the active locale for each request in this order: a
`lang` cookie naming a supported locale (`en`, `es`); otherwise the best match
from the request's `Accept-Language` header among supported locales; otherwise
`en`. A `lang` cookie naming an unsupported locale SHALL be ignored. Every page
SHALL offer a language picker that sets the `lang` cookie and re-renders the page
in the chosen locale, and the page's `<html lang>` SHALL reflect the active
locale.

#### Scenario: Spanish preferred
- **WHEN** a request without a `lang` cookie sends `Accept-Language: es-ES,es;q=0.9`
- **THEN** the active locale is `es`

#### Scenario: Unsupported language defaults to English
- **WHEN** a request without a `lang` cookie sends an `Accept-Language` with no
  supported match (or none at all)
- **THEN** the active locale is `en`

#### Scenario: Cookie overrides the header
- **WHEN** a request sends `Accept-Language: en-US` and a `lang=es` cookie
- **THEN** the active locale is `es`

#### Scenario: Unsupported cookie is ignored
- **WHEN** a request sends a `lang=fr` cookie and `Accept-Language: es`
- **THEN** the active locale is `es`

#### Scenario: Picking a language
- **WHEN** a viewer chooses Español in the language picker
- **THEN** the page reloads in Spanish and later pages stay in Spanish
