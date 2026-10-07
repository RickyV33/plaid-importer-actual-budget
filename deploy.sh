#!/usr/bin/env bash
# Build + version + push plaid-importer to the Forgejo registry.
#
# Usage:
#   ./deploy.sh            # build + push the current VERSION (no bump / tag)
#   ./deploy.sh patch      # bump patch, commit, tag v<version>, build + push
#   ./deploy.sh minor      # bump minor
#   ./deploy.sh major      # bump major
#   ./deploy.sh 1.4.0      # set an explicit version, commit, tag, build + push
#   ./deploy.sh jank v1.4.0  # any of the above, to a named target (see below);
#   ./deploy.sh hub          # a leading "v" on the version is optional
#
# Config comes from deploy.env or your shell (e.g. ~/.zshrc): REGISTRY (required),
# PULL_REGISTRY (default: $REGISTRY), OWNER (required), IMAGE_NAME,
# PLATFORMS (default: linux/amd64; comma-list e.g. linux/amd64,linux/arm64
# builds a multi-arch manifest).
#
# Named targets: to keep several destinations side by side and switch between
# them, pass the name as the first argument (or set TARGET=<name>, or
# DEPLOY_TARGET as the default) and define
# <NAME>_REGISTRY / <NAME>_OWNER / <NAME>_PLATFORMS in deploy.env or ~/.zshrc.
# Each falls back to the plain var. Example in ~/.zshrc:
#   export HUB_REGISTRY=docker.io HUB_OWNER=you HUB_PLATFORMS=linux/amd64,linux/arm64
#   export PROD_REGISTRY=registry.example.com PROD_OWNER=you
#   export DEPLOY_TARGET=hub
#   alias deploy-hub='TARGET=hub ./deploy.sh'   alias deploy-prod='TARGET=prod ./deploy.sh'
#
# One-time: `docker login "$REGISTRY"`.

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
    *) echo "invalid bump/version: $spec (a target name needs <NAME>_REGISTRY set)" >&2; return 1 ;;
  esac
}

current_version() { tr -d '[:space:]' < VERSION; }

# is_target <word> → true when <WORD>_REGISTRY is defined, i.e. the word names
# a deploy target rather than a bump/version.
is_target() {
  local up
  case "${1:-}" in ''|*[!a-zA-Z0-9_]*) return 1 ;; esac
  up="$(printf '%s' "$1" | tr '[:lower:]' '[:upper:]')"
  eval "[ -n \"\${${up}_REGISTRY:-}\" ]"
}

# resolve_target: when TARGET (or DEPLOY_TARGET) names a destination, set
# REGISTRY/PULL_REGISTRY/OWNER/PLATFORMS from its <NAME>_* vars, each falling
# back to the plain var. No-op when no target is set.
resolve_target() {
  local target up
  target="${TARGET:-${DEPLOY_TARGET:-}}"
  [ -n "$target" ] || return 0
  up="$(printf '%s' "$target" | tr '[:lower:]' '[:upper:]')"
  eval "REGISTRY=\"\${${up}_REGISTRY:-\${REGISTRY:-}}\""
  eval "PULL_REGISTRY=\"\${${up}_PULL_REGISTRY:-\${${up}_REGISTRY:-\${PULL_REGISTRY:-}}}\""
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
    printf "⚠ tag %s already exists. Redeploy it? [y/N] " "$1" >&2
    read -r reply </dev/tty
    case "$reply" in
      [yY]*) return 0 ;;
      *) echo "Aborted." >&2; exit 1 ;;
    esac
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

main() {
  set -euo pipefail

  # Deploy-time config (laptop only — never shipped in the image). Set via
  # deploy.env or your shell (e.g. ~/.zshrc): REGISTRY, PULL_REGISTRY, OWNER.
  [ -f deploy.env ] && . ./deploy.env

  # Optional named target: pick <NAME>_REGISTRY/_OWNER/_PLATFORMS so several
  # destinations can live in deploy.env / ~/.zshrc and switch with TARGET=<name>
  # (or DEPLOY_TARGET as the default). Each falls back to the plain var.
  if is_target "${1:-}"; then
    TARGET="$1"
    shift
  fi
  resolve_target

  REGISTRY="${REGISTRY:?set REGISTRY (deploy.env or ~/.zshrc), or <TARGET>_REGISTRY}"
  PULL_REGISTRY="${PULL_REGISTRY:-$REGISTRY}"
  OWNER="${OWNER:?set OWNER (deploy.env or ~/.zshrc), or <TARGET>_OWNER}"
  IMAGE_NAME="${IMAGE_NAME:-plaid-importer}"
  PLATFORMS="${PLATFORMS:-linux/amd64}"

  local arg="${1:-}" cur next ver
  case "$arg" in v[0-9]*) arg="${arg#v}" ;; esac
  cur="$(current_version)"

  if [ -n "$arg" ]; then
    next="$(next_version "$cur" "$arg")"
    if git rev-parse "v$next" >/dev/null 2>&1; then
      # Tag exists — prompt handled inside ensure_tag_absent; skip commit/tag.
      ensure_tag_absent "v$next"
      echo "► redeploying existing tag v$next"
    else
      require_clean_tree
      printf '%s\n' "$next" > VERSION
      git add VERSION
      git commit -q -m "release: v$next"
      git tag -a "v$next" -m "v$next"
      echo "✓ released v$next"
      push_tag "v$next"
    fi
    ver="$next"
  else
    ver="$cur"
    echo "► no bump — building current version $ver"
  fi

  build_and_push "$ver"
  echo "✓ Done: ${IMAGE_NAME} v${ver} → ${PULL_REGISTRY}/${OWNER}/${IMAGE_NAME}"
}

# Run only when executed directly; sourcing (the test harness) just loads the
# functions above without deploying.
if [ "${BASH_SOURCE[0]:-$0}" = "$0" ]; then
  main "$@"
fi
