FROM node:22-alpine AS build
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
# Strip devDeps so only runtime libs ship to the runner stage.
RUN npm prune --omit=dev

# ────────────────────────────────────────────────────────────────
FROM node:22-alpine
# su-exec: tiny static drop-privileges shim used by the entrypoint.
RUN apk add --no-cache su-exec
WORKDIR /app
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --chown=node:node public ./public
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production
ENV APP_BIND=0.0.0.0
ENV APP_PORT=8080
ENV DATABASE_PATH=/app/data/plaid-importer.db
ENV ACTUAL_CACHE_DIR=/app/data/actual-cache
VOLUME ["/app/data"]

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -q -O /dev/null http://localhost:8080/healthz || exit 1

# Entrypoint starts as root just long enough to chown /app/data so the mounted
# host volume is writable, then drops to the `node` user before running the
# server.
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
