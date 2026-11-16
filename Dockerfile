# Perf review 2026-11-16 item 16: multi-stage build. The runtime image installs production dependencies only and carries
# the compiled dist, the Prisma schema/migrations, certs and content; compilers, test tools and sources stay in the build stage.
FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS build
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build

FROM base AS runtime
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY prisma ./prisma
RUN npx prisma generate
COPY certs ./certs
COPY content ./content
COPY --from=build /app/dist ./dist
COPY scripts/docker-start.sh scripts/assert-isolated-db.mjs ./scripts/
# Inside a container the API must listen on every interface; main.ts defaults to loopback for local runs.
ENV HOST=0.0.0.0
EXPOSE 4100
# Migrations are a separate step now (`npm run db:migrate`, which keeps the isolated-database guard). The old
# `npm run db:migrate && npm start` CMD could never start against a remote database because that guard refuses it.
# MIGRATE_ON_START=true runs the same guarded command before start, for a local or CI container.
CMD ["sh", "scripts/docker-start.sh"]
