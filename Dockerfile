# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    WRANGLER_SEND_METRICS=false \
    CLOUDFLARE_CF_FETCH_ENABLED=false
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libatomic1 \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json .npmrc ./
# Wrangler and Vinext are runtime requirements despite being devDependencies.
RUN npm ci --include=dev --include=optional

FROM dependencies AS builder
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    WRANGLER_SEND_METRICS=false \
    WRANGLER_WRITE_LOGS=false \
    CLOUDFLARE_CF_FETCH_ENABLED=false
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates libatomic1 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/drizzle ./drizzle
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/pocket-entrypoint
RUN mkdir -p /app/.wrangler/state /app/.sites-runtime \
    && chown -R node:node /app/.wrangler /app/.sites-runtime
USER node
EXPOSE 8787
VOLUME ["/app/.wrangler/state"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:8787/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["pocket-entrypoint"]
CMD ["serve"]
