#!/usr/bin/env bash
# Refresh the README screenshots from demo data.
#   1. build the app and write a static demo copy (in the dev container)
#   2. serve it on the host and capture each page with headless Chrome at
#      1112x813 CSS px, 2x (2224x1626)
# Usage: ./scripts/screenshots.sh [page ...]   (default: the README set)
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
OUT=dist/screens
PORT="${PORT:-4173}"
PAGES=("$@")
[ ${#PAGES[@]} -eq 0 ] && PAGES=(overview connections profiles schedules history settings)

devcontainer exec --workspace-folder . bash -lc "npm run build >/dev/null && npx tsx scripts/screenshots.ts $OUT"

python3 scripts/screenshots_server.py "$OUT" "$PORT" &
SERVER=$!
trap 'kill $SERVER' EXIT
sleep 1

url_of() { [ "$1" = overview ] && echo "/" || echo "/$1"; }

mkdir -p docs/screenshots
for page in "${PAGES[@]}"; do
  # The demo data's times are in this zone; the browser shows times in its own.
  TZ=America/Chicago "$CHROME" --headless=new --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --window-size=1112,813 --virtual-time-budget=5000 --lang=en-US --force-prefers-reduced-motion \
    --screenshot="$PWD/docs/screenshots/$page.png" "http://127.0.0.1:$PORT$(url_of "$page")" 2>/dev/null
  echo "captured docs/screenshots/$page.png"
done
