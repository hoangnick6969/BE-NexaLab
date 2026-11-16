#!/bin/sh
# Container entry (Dockerfile). Migrations are their own step; MIGRATE_ON_START=true runs the guarded
# `npm run db:migrate` (isolated-database check, then prisma migrate deploy) before the API starts.
set -e
if [ "${MIGRATE_ON_START:-false}" = "true" ]; then
  npm run db:migrate
fi
exec node dist/src/main.js
