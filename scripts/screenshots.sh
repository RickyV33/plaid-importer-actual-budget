#!/usr/bin/env bash
# Refresh the README screenshots from demo data.
#   1. render each page to HTML inside the dev container (scripts/screenshots.ts)
#   2. capture each with headless Chrome on the host, at 1112x813 CSS px, 2x
# Usage: ./scripts/screenshots.sh [page ...]   (default: the README set)
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
OUT=dist/screens
PAGES=("$@")
[ ${#PAGES[@]} -eq 0 ] && PAGES=(overview connections profiles schedules history settings)

devcontainer exec --workspace-folder . npx tsx scripts/screenshots.ts "$OUT"

mkdir -p docs/screenshots
for page in "${PAGES[@]}"; do
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=1112,813 --virtual-time-budget=4000 \
    --screenshot="$PWD/docs/screenshots/$page.png" "file://$PWD/$OUT/$page.html" 2>/dev/null
  echo "captured docs/screenshots/$page.png"
done
