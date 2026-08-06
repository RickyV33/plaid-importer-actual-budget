## Why

The running app never tells you which version it is. `VERSION` (currently `2.8.0`)
is read only by `deploy.sh` at build time, so answering "what's deployed?" means
checking the registry tag or the host — not the app. Worse, `deploy.sh` already
passes `--build-arg VERSION` but the `Dockerfile` never declares `ARG VERSION`,
so the value is silently discarded today.

## What Changes

- The `Dockerfile` runner stage declares `ARG VERSION` (defaulting to `dev`) and
  exports it as `ENV APP_VERSION`, making the build arg `deploy.sh` already
  passes actually reach the container.
- The app resolves its version at startup: `APP_VERSION` from the environment,
  falling back to reading the repo-root `VERSION` file for local development,
  falling back to `dev`.
- Every rendered page shows the resolved version as `v<version>` in the top bar,
  beside the application title — muted, smaller, baseline-aligned. The string is
  locale-neutral, so it needs no message-catalog entry.

Out of scope for this change: a Settings "About" card and a version field in the
`/healthz` payload. Both remain viable follow-ups.

## Capabilities

### New Capabilities

- `app-version-display`: how the application resolves the version it is running
  and surfaces it to users on every page.

### Modified Capabilities

None. The version label is new page chrome and changes no existing requirement;
`app-navigation` continues to govern the nav and dashboard unchanged.

## Impact

- `Dockerfile` — new `ARG`/`ENV` in the runner stage.
- `src/config.ts` — new resolved `appVersion` value with a `VERSION`-file fallback.
- `src/views/render.ts` — passes `version` into the shared template data.
- `src/views/layout.eta` — version label beside the brand in the top bar.
- `public/style.css` — `.brand-block` / `.app-version` styling.
- No database, API, dependency, or deploy-script changes. `deploy.sh` already
  passes the build arg and needs no edit.
