#!/bin/sh
set -e

# Volume mounted at /app/data; ensure the `node` user can write to it.
mkdir -p /app/data
chown -R node:node /app/data

exec su-exec node:node node dist/server.js
