## MODIFIED Requirements

### Requirement: Locale is resolved from the request

The system SHALL resolve the active locale in this order: a `lang` cookie
naming a supported locale (`en`, `es`); otherwise the best supported match from
the viewer's preferred languages (the request's `Accept-Language` header on
server-rendered pages, the browser's language list in the client application);
otherwise `en`. A `lang` cookie naming an unsupported locale SHALL be ignored.
Every page SHALL offer a language picker that sets the `lang` cookie and shows
the page in the chosen locale (in the client application, without reloading),
and the document's `lang` attribute SHALL reflect the active locale. Server
pages and the client application SHALL use the same message catalog.

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
- **THEN** the page shows in Spanish and later pages, including the sign-in page, stay in Spanish
