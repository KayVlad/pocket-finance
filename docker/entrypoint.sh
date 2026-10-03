#!/bin/sh
set -eu

if [ "${1:-}" = "serve" ]; then
  # Apply pending migrations against the same persisted D1 store as the app.
  node scripts/setup-local.mjs
  exec node --import ./scripts/sites-env.mjs \
    ./node_modules/wrangler/bin/wrangler.js dev \
    --config dist/server/wrangler.json \
    --local --persist-to .wrangler/state \
    --ip 0.0.0.0 --port 8787 --inspector-port 0
fi

exec "$@"
