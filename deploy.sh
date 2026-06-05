#!/usr/bin/env bash
# Build + version + push __PROJECT_NAME__ to the Forgejo registry, then publish
# its mental-model.html to plop.
#
# Usage:
#   ./deploy.sh            # build + push the current VERSION (no bump / tag)
#   ./deploy.sh patch      # bump patch, commit, tag v<version>, build + push
#   ./deploy.sh minor      # bump minor
#   ./deploy.sh major      # bump major
#   ./deploy.sh 1.4.0      # set an explicit version, commit, tag, build + push
#
# Config comes from deploy.env or your shell (e.g. ~/.zshrc): REGISTRY (required),
# PULL_REGISTRY (default: $REGISTRY), OWNER (required), IMAGE_NAME,
# PLATFORMS (default: linux/amd64; comma-list e.g. linux/amd64,linux/arm64
# builds a multi-arch manifest).
#
# Named targets: to keep several destinations side by side and switch between
# them, set TARGET=<name> (or DEPLOY_TARGET as the default) and define
# <NAME>_REGISTRY / <NAME>_OWNER / <NAME>_PLATFORMS in deploy.env or ~/.zshrc.
# Each falls back to the plain var. Example in ~/.zshrc:
#   export HUB_REGISTRY=docker.io HUB_OWNER=you HUB_PLATFORMS=linux/amd64,linux/arm64
#   export PROD_REGISTRY=registry.example.com PROD_OWNER=you
#   export DEPLOY_TARGET=hub
#   alias deploy-hub='TARGET=hub ./deploy.sh'   alias deploy-prod='TARGET=prod ./deploy.sh'
#
# One-time: `docker login "$REGISTRY"`. Optional: export
# PLOP_ADMIN_URL (or set it in a gitignored deploy.env) to publish the
# mental-model to plop. PLOP_ADMIN_URL is deploy-time config read only here on
# your machine — it never ships in the image, and it is NOT the app's .env.

# ─── Pure helpers (also sourced by the test harness) ─────────────────

# next_version <current> <major|minor|patch|X.Y.Z> → prints the next version.
next_version() {
  local cur="${1:-}" spec="${2:-}" major minor patch
  case "$cur" in
    [0-9]*.[0-9]*.[0-9]*) ;;
    *) echo "invalid current version: $cur" >&2; return 1 ;;
  esac
  IFS=. read -r major minor patch <<EOF
$cur
EOF
  case "$spec" in
    major) printf '%s.0.0\n' "$((major + 1))" ;;
    minor) printf '%s.%s.0\n' "$major" "$((minor + 1))" ;;
    patch) printf '%s.%s.%s\n' "$major" "$minor" "$((patch + 1))" ;;
    [0-9]*.[0-9]*.[0-9]*) printf '%s\n' "$spec" ;;
    *) echo "invalid bump/version: $spec" >&2; return 1 ;;
  esac
}

current_version() { tr -d '[:space:]' < VERSION; }

# resolve_target: when TARGET (or DEPLOY_TARGET) names a destination, set
# REGISTRY/PULL_REGISTRY/OWNER/PLATFORMS from its <NAME>_* vars, each falling
# back to the plain var. No-op when no target is set.
resolve_target() {
  local target up
  target="${TARGET:-${DEPLOY_TARGET:-}}"
  [ -n "$target" ] || return 0
  up="$(printf '%s' "$target" | tr '[:lower:]' '[:upper:]')"
  eval "REGISTRY=\"\${${up}_REGISTRY:-\${REGISTRY:-}}\""
  eval "PULL_REGISTRY=\"\${${up}_PULL_REGISTRY:-\${PULL_REGISTRY:-}}\""
  eval "OWNER=\"\${${up}_OWNER:-\${OWNER:-}}\""
  eval "PLATFORMS=\"\${${up}_PLATFORMS:-\${PLATFORMS:-}}\""
}

# ─── Side-effecting steps ────────────────────────────────────────────

require_clean_tree() {
  if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "✗ working tree not clean — commit or stash before releasing" >&2
    exit 1
  fi
}

ensure_tag_absent() {
  if git rev-parse "$1" >/dev/null 2>&1; then
    echo "✗ tag $1 already exists — bump to a new version" >&2
    exit 1
  fi
}

push_tag() {
  if git remote get-url origin >/dev/null 2>&1; then
    git push origin "$1"
    echo "  pushed tag $1 to origin"
  else
    echo "  no origin remote — tag $1 kept local"
  fi
}

build_and_push() {
  local v="$1"
  local full="${REGISTRY}/${OWNER}/${IMAGE_NAME}:${v}"
  local latest="${REGISTRY}/${OWNER}/${IMAGE_NAME}:latest"
  local platforms="${PLATFORMS:-linux/amd64}"
  if [ "$platforms" = "${platforms%,*}" ]; then
    # Single platform: build into the local daemon, then push both tags.
    echo "► Building ${full} (${platforms})…"
    docker buildx build --platform "$platforms" \
      --build-arg VERSION="$v" \
      -t "$full" -t "$latest" --load .
    echo "► Pushing ${full} + :latest…"
    docker push "$full"
    docker push "$latest"
  else
    # Multi-arch: a container-driver builder pushes the manifest directly
    # (--load can't hold a multi-platform image).
    local builder="${BUILDER:-deploy-multi}"
    if ! docker buildx inspect "$builder" >/dev/null 2>&1; then
      echo "► Creating buildx builder '${builder}'…"
      docker buildx create --name "$builder" --driver docker-container --bootstrap >/dev/null
    fi
    echo "► Building + pushing ${full} (${platforms})…"
    docker buildx build --builder "$builder" --platform "$platforms" \
      --build-arg VERSION="$v" \
      -t "$full" -t "$latest" --push .
  fi
}

# Best-effort: a down/unreachable plop warns but never fails the deploy.
publish_mental_model() {
  local v="$1"
  if [ -z "${PLOP_ADMIN_URL:-}" ]; then
    echo "PLOP_ADMIN_URL unset — skipping mental-model publish"
    return 0
  fi
  if [ ! -f mental-model.html ]; then
    echo "no mental-model.html — skipping publish"
    return 0
  fi
  local tmp stable pinned name
  tmp="$(mktemp)"
  sed "s/__VERSION__/${v}/g" mental-model.html > "$tmp"
  stable="${IMAGE_NAME}-mental-model.html"
  pinned="${IMAGE_NAME}-mental-model-${v}.html"
  for name in "$stable" "$pinned"; do
    if curl -fsS -X POST "${PLOP_ADMIN_URL%/}/upload" \
        -F "file=@${tmp};filename=${name};type=text/html" \
        -F "name=${name}" -F "overwrite=true" >/dev/null 2>&1; then
      echo "  published ${name}"
    else
      echo "  warn: failed to publish ${name} (continuing)"
    fi
  done
  rm -f "$tmp"
  return 0
}

main() {
  set -euo pipefail

  # Deploy-time config (laptop only — never shipped in the image). Set via
  # deploy.env or your shell (e.g. ~/.zshrc): REGISTRY, PULL_REGISTRY, OWNER.
  [ -f deploy.env ] && . ./deploy.env

  # Optional named target: pick <NAME>_REGISTRY/_OWNER/_PLATFORMS so several
  # destinations can live in deploy.env / ~/.zshrc and switch with TARGET=<name>
  # (or DEPLOY_TARGET as the default). Each falls back to the plain var.
  resolve_target

  REGISTRY="${REGISTRY:?set REGISTRY (deploy.env or ~/.zshrc), or <TARGET>_REGISTRY}"
  PULL_REGISTRY="${PULL_REGISTRY:-$REGISTRY}"
  OWNER="${OWNER:?set OWNER (deploy.env or ~/.zshrc), or <TARGET>_OWNER}"
  IMAGE_NAME="${IMAGE_NAME:-plaid-importer}"
  PLATFORMS="${PLATFORMS:-linux/amd64}"

  local arg="${1:-}" cur next ver
  cur="$(current_version)"

  if [ -n "$arg" ]; then
    next="$(next_version "$cur" "$arg")"
    require_clean_tree
    ensure_tag_absent "v$next"
    printf '%s\n' "$next" > VERSION
    git add VERSION
    git commit -q -m "release: v$next"
    git tag -a "v$next" -m "v$next"
    echo "✓ released v$next"
    push_tag "v$next"
    ver="$next"
  else
    ver="$cur"
    echo "► no bump — building current version $ver"
  fi

  build_and_push "$ver"
  publish_mental_model "$ver"
  echo "✓ Done: ${IMAGE_NAME} v${ver} → ${PULL_REGISTRY}/${OWNER}/${IMAGE_NAME}"
}

# Run only when executed directly; sourcing (the test harness) just loads the
# functions above without deploying.
if [ "${BASH_SOURCE[0]:-$0}" = "$0" ]; then
  main "$@"
fi
