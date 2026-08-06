## 1. Version resolution unit

- [x] 1.1 Create `src/version.ts` exporting `resolveVersion(env, readVersionFile)`
      — precedence `APP_VERSION` (non-empty, trimmed) → `VERSION` file contents
      (trimmed, non-empty) → `"dev"` — with the file reader injected and any read
      error swallowed into the next fallback.
- [x] 1.2 Add `formatVersion(version)` to `src/version.ts`: prefix `v` when the
      string starts with a digit, otherwise return it verbatim.
- [x] 1.3 Write `src/version.test.ts` covering env-wins, whitespace-only env
      falling through, file fallback with trailing newline trimmed, missing/
      unreadable/empty file → `dev`, and both `formatVersion` branches
      (`2.8.0` → `v2.8.0`, `2.9.0-rc1` → `v2.9.0-rc1`, `dev` → `dev`).

## 2. Wire resolution into config

- [x] 2.1 Add `APP_VERSION` to the zod schema in `src/config.ts` as an optional
      string defaulting to `""`, with a comment noting it is supplied by the
      image at build time and deliberately absent from `.env.example`.
- [x] 2.2 Expose `appVersion` on the resolved `Config` by calling
      `resolveVersion` in `loadConfig()`, reading
      `path.resolve(__dirname, "..", "VERSION")` as the file fallback.

## 3. Container carries the version

- [ ] 3.1 Declare `ARG VERSION=dev` and `ENV APP_VERSION=${VERSION}` in the
      runner stage of `Dockerfile`, alongside the existing `ENV` block.
- [ ] 3.2 Verify the build arg lands: build with
      `docker buildx build --build-arg VERSION=9.9.9 -t plaid-importer:argcheck .`
      and confirm `docker run --rm plaid-importer:argcheck printenv APP_VERSION`
      prints `9.9.9`; confirm a build with no build arg yields `dev`.

## 4. Render the footer

- [ ] 4.1 Add `version: formatVersion(config.appVersion)` to the enriched
      template data in `render()` (`src/views/render.ts`), so every page and the
      layout receive it.
- [ ] 4.2 Add `<footer class="app-footer">` below `<main>` in
      `src/views/layout.eta` rendering the version, with no message-catalog
      lookup.
- [ ] 4.3 Style `.app-footer` in `public/style.css` — muted secondary text,
      normal document flow (not fixed or sticky), mobile-first with no
      breakpoint needed.

## 5. Verify

- [ ] 5.1 Run the full suite in the dev container
      (`devcontainer exec --workspace-folder . npm test`) and confirm it is green,
      including the new `version.test.ts`.
- [ ] 5.2 Run the app locally with no `APP_VERSION` set and confirm the footer
      reads `v2.8.0` (from the `VERSION` file) on both an authenticated page and
      the signed-out login page, in `en` and `es`.
- [ ] 5.3 Confirm the footer does not overlap or crowd content at a 375px
      viewport width.

## 6. Documentation

- [ ] 6.1 Note the `APP_VERSION` build-arg → env plumbing in `DEPLOY.md` so the
      relationship between `VERSION`, `--build-arg`, and the displayed version is
      discoverable.
