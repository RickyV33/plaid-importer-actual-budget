#!/usr/bin/env bash
# Build + push the plaid-importer container to a named target registry.
#
# Usage:
#   ./deploy.sh               # build + push the default target, :latest
#   ./deploy.sh hub           # -> Docker Hub (public), multi-arch, :latest
#   ./deploy.sh jank v1       # -> code.jankbyrick.com, amd64, :v1 (and :latest)
#
# Targets resolve registry / owner / platforms below. Every value can be
# overridden from your shell (e.g. ~/.zshrc) via the namespaced vars in
# brackets, so you can keep hosts and owners out of the repo:
#
#   hub  -> ${HUB_REGISTRY:-docker.io} / ${HUB_OWNER:-rickyv33}
#           ${HUB_PLATFORMS:-linux/amd64,linux/arm64}
#   jank -> ${JANK_REGISTRY:-code.jankbyrick.com} / ${JANK_OWNER:-rick}
#           ${JANK_PLATFORMS:-linux/amd64}
#
#   DEPLOY_TARGET   target used when none is given on the CLI (default: hub)
#   IMAGE_NAME      image name                       (default: plaid-importer)
#   BUILDER         buildx builder name              (default: plaid-deploy)
#
# One-time per registry: `docker login <registry host>`.

set -euo pipefail

TARGET="${1:-${DEPLOY_TARGET:-hub}}"
TAG="${2:-latest}"

case "${TARGET}" in
  hub)
    REGISTRY="${HUB_REGISTRY:-docker.io}"
    OWNER="${HUB_OWNER:-rickyv33}"
    PLATFORMS="${HUB_PLATFORMS:-linux/amd64,linux/arm64}"
    ;;
  jank)
    REGISTRY="${JANK_REGISTRY:-code.jankbyrick.com}"
    OWNER="${JANK_OWNER:-rick}"
    PLATFORMS="${JANK_PLATFORMS:-linux/amd64}"
    ;;
  *)
    echo "Unknown target '${TARGET}'. Use 'hub' or 'jank'." >&2
    exit 1
    ;;
esac

IMAGE_NAME="${IMAGE_NAME:-plaid-importer}"
BUILDER="${BUILDER:-plaid-deploy}"

FULL="${REGISTRY}/${OWNER}/${IMAGE_NAME}:${TAG}"
LATEST="${REGISTRY}/${OWNER}/${IMAGE_NAME}:latest"

# Multi-arch + direct registry push needs a container-driver builder; create
# it once and reuse it after.
if ! docker buildx inspect "${BUILDER}" >/dev/null 2>&1; then
  echo "► Creating buildx builder '${BUILDER}'..."
  docker buildx create --name "${BUILDER}" --driver docker-container --bootstrap >/dev/null
fi

echo "► Building ${FULL}"
echo "  platforms: ${PLATFORMS}"
docker buildx build \
  --builder "${BUILDER}" \
  --platform "${PLATFORMS}" \
  -t "${FULL}" \
  -t "${LATEST}" \
  --push \
  .

echo "✓ Pushed ${FULL}"
[[ "${TAG}" != "latest" ]] && echo "  (also updated ${LATEST})"
echo "  Pull: docker pull ${FULL}"
echo "  Runtime env: SESSION_SECRET, TOKEN_ENCRYPTION_KEY, APP_USER/APP_PASSWORD,"
echo "               PLAID_* and ACTUAL_* vars."
