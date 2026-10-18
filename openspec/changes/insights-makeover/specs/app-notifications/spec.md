## ADDED Requirements

### Requirement: Connection-health banners on every authenticated page

The system SHALL show a health banner on every authenticated page, in the same
banner area as named banners and ahead of them, for each current incident in the
viewing user's own data:

- **Actual unreachable** (error): the latest sync run that recorded results for
  one of the user's profiles recorded, for that profile, a failure whose reason
  marks the Actual budget as unreachable. The banner SHALL name the profile, say
  that the budget couldn't be reached and that pending transactions will be
  delivered on the next successful sync, and link to the Profiles page.
- **Import errors** (warning): that latest run recorded, for that profile,
  failures for any other reason. The banner SHALL name the profile and link to
  the History page.
- **Bank needs reconnecting** (error): one of the user's connections requires
  relinking. The banner SHALL name the institution and link to the Connections
  page.

Health banners SHALL be derived only from locally stored state; rendering a page
SHALL NOT make Plaid or Actual Budget calls to decide them. An incident SHALL
stop showing without user action once it no longer holds: a later run for that
profile records no failures, or the connection is no longer marked for relink.

#### Scenario: Actual budget unreachable
- **WHEN** a user's most recent sync for profile "Household" failed because the
  Actual server could not be reached, and the user opens any page
- **THEN** the page shows an error banner naming "Household" with a link to the
  Profiles page

#### Scenario: Import errors
- **WHEN** a profile's most recent run recorded a failed import for one account
  for a reason other than an unreachable budget
- **THEN** every page shows a warning banner naming that profile with a link to
  History

#### Scenario: Bank needs reconnecting
- **WHEN** one of the user's connections requires relinking
- **THEN** every page shows an error banner naming the institution with a link to
  Connections

#### Scenario: Banner clears after recovery
- **WHEN** a later sync for that profile completes with no failures
- **THEN** the health banner for that profile no longer appears

#### Scenario: Other users' incidents are not shown
- **WHEN** another user's budget is unreachable
- **THEN** the viewing user sees no banner for it

#### Scenario: No live checks on render
- **WHEN** any page renders health banners
- **THEN** no Plaid or Actual Budget request is made to decide them

### Requirement: Health banners are dismissable per incident

Each health banner SHALL be dismissable with an icon button using the existing
`POST /banners/:key/dismiss` mechanism. Its key SHALL identify the specific
incident (the profile and the failing run, or the connection and the time it was
marked for relink), so dismissing hides only that incident: a later failing run,
or a new relink event, SHALL show a banner again.

#### Scenario: Dismiss hides this incident
- **WHEN** a user dismisses the "Actual unreachable" banner for a profile
- **THEN** the banner doesn't reappear on later pages while the same failing run
  is the profile's latest

#### Scenario: New failure shows again
- **WHEN** a user dismissed a health banner and a later run for the same profile
  also fails
- **THEN** a banner for the new incident appears
