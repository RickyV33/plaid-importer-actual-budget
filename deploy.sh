#!/usr/bin/env bash
# Build + push the plaid-importer container to your container registry.
#
# Usage:
#   ./deploy.sh              # build + push :latest
#   ./deploy.sh v1           # build + push :v1 AND :latest
#
# Config comes from the environment (e.g. exported in ~/.zshrc):
#   REGISTRY        registry host to push to       (required)
#   PULL_REGISTRY   host shown in the pull hint     (default: $REGISTRY)
#   OWNER           registry namespace / user       (required)
#   IMAGE_NAME      image name                      (default: plaid-importer)
# One-time: `docker login "$REGISTRY"`.

set -euo pipefail

REGISTRY="${REGISTRY:?set REGISTRY (e.g. export REGISTRY=registry.example.com in ~/.zshrc)}"
PULL_REGISTRY="${PULL_REGISTRY:-$REGISTRY}"
OWNER="${OWNER:?set OWNER (e.g. export OWNER=you in ~/.zshrc)}"
IMAGE_NAME="${IMAGE_NAME:-plaid-importer}"
TAG="${1:-latest}"

FULL="${REGISTRY}/${OWNER}/${IMAGE_NAME}:${TAG}"
LATEST="${REGISTRY}/${OWNER}/${IMAGE_NAME}:latest"

echo "► Building ${FULL} (linux/amd64)..."
docker buildx build \
  --platform linux/amd64 \
  -t "${FULL}" \
  -t "${LATEST}" \
  --load \
  .

echo "► Pushing ${FULL}..."
docker push "${FULL}"

if [[ "${TAG}" != "latest" ]]; then
  echo "► Pushing ${LATEST}..."
  docker push "${LATEST}"
fi

echo "✓ Done. On Unraid, pull ${PULL_REGISTRY}/${OWNER}/${IMAGE_NAME}:${TAG}"
echo "  Remember: SESSION_SECRET, TOKEN_ENCRYPTION_KEY, APP_USER/APP_PASSWORD,"
echo "            PLAID_* and ACTUAL_* env vars."
