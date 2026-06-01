#!/bin/sh
set -e

echo "==> Running database migrations..."
cd /app
pnpm --filter @workspace/db run push --accept-data-loss || echo "Migration warning (continuing anyway)"

echo "==> Starting server..."
exec node --enable-source-maps /app/artifacts/api-server/dist/index.mjs
