## Context

`VERSION` at the repo root is the single source of truth for the project's
version (`2.8.0` today), and `deploy.sh` bumps it, tags it, and passes it to
`docker buildx build` as `--build-arg VERSION`. Nothing downstream consumes it:
the `Dockerfile` never declares `ARG VERSION`, so Docker discards the argument,
and `VERSION` is not `COPY`'d into the image either. The running app therefore
has no way to know its own version.

The rendering path is centralized: `render()` in `src/views/render.ts` is the
single funnel for every page — it enriches template data, renders the page
template, then wraps it in `layout.eta`. That makes a global footer a
one-location change. Configuration is likewise centralized: `src/config.ts`
parses `process.env` with zod at module load and `process.exit(1)`s on failure.

## Goals / Non-Goals

**Goals:**

- Make the version the app reports match the image tag it was deployed from.
- Show it on every page without adding chrome that competes with content.
- Keep local `npm run dev` honest — it should show the real `VERSION`, not a
  placeholder, without anyone having to set an env var.
- Keep version resolution and formatting unit-testable in isolation.

**Non-Goals:**

- A Settings "About" card (version, build date, commit SHA) — deferred.
- A version field in `/healthz` — deferred.
- Any change to `deploy.sh`; it already passes the build arg correctly.
- Surfacing the git commit SHA or build timestamp. Only the semantic version.

## Decisions

### Resolution lives in its own module, not inline in `config.ts`

A new `src/version.ts` exports two pure functions:

- `resolveVersion(env, readVersionFile)` — applies the precedence
  `APP_VERSION` → `VERSION` file → `dev`.
- `formatVersion(version)` — the display rule.

`config.ts` calls `resolveVersion(process.env, …)` once and exposes the result as
`config.appVersion`.

*Why:* `config.ts` runs `loadConfig()` at module load and can `process.exit(1)`,
which makes anything embedded in it awkward to unit-test. Keeping resolution as a
pure function with its file reader injected means the three precedence branches
and the fallback are directly testable, per the repo's "inject dependencies for
testability" convention. *Alternative considered:* adding `APP_VERSION` to the
zod schema with a `.default()` and doing the file fallback inline — fewer files,
but the fallback logic would then only be reachable through a module that exits
the process on bad input.

`APP_VERSION` is still declared in the zod schema (as an optional string
defaulting to `""`) so it stays documented alongside every other environment
input rather than being a hidden variable.

### Resolve once at startup, not per request

The version cannot change while the process runs, so the `VERSION` file is read
at most once at startup and the result is a plain string on `config`. No
per-request file I/O.

### The `VERSION` file path is the same relative depth from `src/` and `dist/`

`src/config.ts` compiles to `dist/config.js`, so `path.resolve(__dirname, "..",
"VERSION")` resolves to the repo root under `tsx` and to `/app/VERSION` in the
container — one expression for both. In the container that path does not exist,
which is correct: production gets its version from `APP_VERSION`, and the missing
file simply falls through. The read is wrapped so any error (missing, unreadable,
empty) falls through to `dev` rather than throwing during startup.

### `dev` renders verbatim; numeric versions get a `v` prefix

`formatVersion` prefixes with `v` only when the string starts with a digit. A
blanket prefix would render the fallback as `vdev`, which reads as a typo. This
keeps `v2.8.0` and `dev` both looking deliberate, and the rule is one testable
predicate.

### The footer carries no catalog string

The footer's entire content is the formatted version — a number, or the literal
`dev`. There is no prose to translate, so it needs no entry in `src/i18n/en.ts` /
`es.ts` and renders identically in both locales. This is consistent with the
repo's i18n rule rather than an exception to it: the rule exists to keep
*user-facing prose* out of templates, and a version number is not prose. If the
footer later gains a label ("Version 2.8.0") or a license line, that text goes in
the catalog at that point.

### `ARG VERSION` goes in the runner stage

`ARG` is scoped per build stage. The value is only needed as a runtime `ENV`, so
it is declared in the second (runner) stage next to the other `ENV` lines, with
`ARG VERSION=dev` supplying the default for plain `docker build` /
`npm run docker:build`, neither of which passes the argument.

## Risks / Trade-offs

- **A stale `APP_VERSION` in someone's `.env` would silently override the truth.**
  → `APP_VERSION` is deliberately left out of `.env.example` so nobody is
  prompted to set it; it is a build-time value the image supplies. Documented as
  such in the config schema comment.

- **The footer adds a page element to every view, including the login page.**
  → That is intended (support questions come from signed-out users too), and the
  version number is not sensitive — it is already public in the image tag and the
  git tag. No credentials, hostnames, or env values are exposed.

- **`formatVersion`'s "starts with a digit" rule is a heuristic.** → It covers the
  only two shapes that actually occur (semver from `VERSION`, and the literal
  `dev`). A pre-release like `2.9.0-rc1` still starts with a digit and formats
  correctly.

- **Existing pages were not designed with a footer.** → It renders below `<main>`
  as de-emphasized text in normal document flow — not fixed or sticky — so it
  cannot overlap content on short viewports, and mobile-first styling comes
  first with no breakpoint needed.

## Migration Plan

No data migration and no config migration. The change is additive: an image built
before it simply lacks `APP_VERSION`, and an image built after it carries the
value. Rollback is reverting the commit — nothing persists state.

One ordering note: the first deploy carrying this change is also the first build
whose `--build-arg VERSION` is honored, so the footer becomes correct from that
deploy onward with no manual step.

## Open Questions

None blocking. Whether the footer should later link to the GitHub release for its
tag is a follow-up, and depends on whether the repo has a public remote.
