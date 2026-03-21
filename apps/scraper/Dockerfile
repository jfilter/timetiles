# Production Dockerfile for TimeScrape Runner
# Multi-stage build with turbo prune for monorepo workspace resolution

# Stage 1: Base image with pnpm
# Uses node:24-slim (not alpine) because the runner shells out to system tools
# and slim provides better glibc compatibility for native npm packages
FROM node:24-slim AS base
RUN corepack enable \
    && corepack prepare pnpm@10.12.4 --activate
WORKDIR /app

# Stage 2: Prune the monorepo for the scraper package
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo prune scraper --docker

# Stage 3: Install all dependencies and build
FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN --mount=type=cache,id=pnpm-scraper,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .

WORKDIR /app/apps/scraper
RUN pnpm exec tsup src/index.ts --format esm --dts

# Stage 4: Production dependencies only (clean, no workspace refs)
FROM node:24-slim AS deps
WORKDIR /app
COPY --from=builder /app/apps/scraper/package.json ./
# Remove workspace: refs (devDependencies only), then install prod deps with npm
RUN grep -v '"workspace:' package.json > pkg.clean.json && mv pkg.clean.json package.json && \
    npm install --omit=dev

# Stage 5: Production runner
FROM node:24-slim

RUN useradd -m -u 1001 -s /bin/false timescrape
WORKDIR /app

COPY --from=builder /app/apps/scraper/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
COPY --from=builder /app/apps/scraper/src/security/seccomp-profile.json ./dist/security/seccomp-profile.json

USER timescrape
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
