#!/usr/bin/env bash
# Build + push the plaid-importer container to the Forgejo registry.
#
# Usage:
#   ./deploy.sh              # build + push :latest
#   ./deploy.sh v1           # build + push :v1 AND :latest
#
# One-time: `docker login registry.jankbyrick.com`.

set -euo pipefail

# registry.jankbyrick.com is a LAN-only hostname (A record → private IP) that
# bypasses Cloudflare's 100 MB body limit. Forgejo stores the package under
# rick/plaid-importer regardless of which hostname is used to push, so Unraid
# can still pull from code.jankbyrick.com (pulls aren't capped).
REGISTRY="${REGISTRY:-registry.jankbyrick.com}"
PULL_REGISTRY="${PULL_REGISTRY:-code.jankbyrick.com}"
OWNER="${OWNER:-rick}"
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
