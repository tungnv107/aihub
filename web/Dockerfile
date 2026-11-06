FROM node:24.22.1-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-only placeholders. Runtime secrets are injected by Compose, never bundled as NEXT_PUBLIC variables.
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build REDIS_URL=redis://127.0.0.1:6379
ENV BETTER_AUTH_URL=https://build.invalid BETTER_AUTH_SECRET=build-only-placeholder-not-a-runtime-secret
ENV LICENSE_HASH_SECRET=build-only-placeholder-not-a-runtime-secret AIHUB_GATEWAY_SECRET=build-only-placeholder-not-a-runtime-secret
ENV LICENSE_ENCRYPTION_KEY=0000000000000000000000000000000000000000000000000000000000000000
ENV SUB2API_URL=http://sub2api:8080 PAYMENT_PROVIDER=disabled
RUN npm run build

FROM node:24.22.1-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --system --gid 1001 aihub && useradd --system --uid 1001 --gid aihub aihub && mkdir -p /app/.data/uploads && chown -R aihub:aihub /app
COPY --from=build --chown=aihub:aihub /app/.next/standalone ./
COPY --from=build --chown=aihub:aihub /app/.next/static ./.next/static
COPY --from=build --chown=aihub:aihub /app/public ./public
USER aihub
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.js"]

FROM dependencies AS worker
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/src ./src
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts/seed-policies.ts ./scripts/seed-policies.ts
COPY --from=build /app/prisma.config.ts /app/tsconfig.json ./
USER node
CMD ["node_modules/.bin/tsx","src/server/worker.ts"]
