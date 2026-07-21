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
RUN pnpm dlx turbo prune timescrape --docker

# Stage 3: Install all dependencies and build
FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/out/pnpm-workspace.yaml ./pnpm-workspace.yaml

RUN --mount=type=cache,id=pnpm-scraper,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts

COPY --from=pruner /app/out/full/ .

WORKDIR /app/apps/timescrape
RUN pnpm exec tsup src/index.ts --format esm --dts

# Stage 4: Production dependencies only (clean, no workspace refs)
FROM node:24-slim AS deps
WORKDIR /app
COPY --from=builder /app/apps/timescrape/package.json ./
# Drop devDependencies before installing prod deps with npm. They use pnpm-only
# `workspace:`/`catalog:` protocols that npm can't parse (EUNSUPPORTEDPROTOCOL),
# and `--omit=dev` excludes them from the install anyway. Prod dependencies are
# plain semver and install cleanly. Done via node so the JSON stays valid.
RUN node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));delete p.devDependencies;fs.writeFileSync('package.json',JSON.stringify(p,null,2));" && \
    npm install --omit=dev

# Stage 5: Production runner
FROM node:24-slim

RUN useradd -m -u 1001 -s /bin/false timescrape
WORKDIR /app

COPY --from=builder /app/apps/timescrape/dist ./dist
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/package.json ./
# Next to the bundle, not under dist/security/. container-config.ts resolves the
# profile against import.meta.dirname, and tsup flattens src/index.ts into
# dist/index.js, so at runtime that directory is dist/ — mirroring the source
# layout here put the file one level away from where it is looked up. Every
# container then died with
#   opening seccomp profile failed: .../dist/seccomp-profile.json: no such file
# which stayed invisible for as long as the runner could not start a container
# at all for unrelated reasons.
COPY --from=builder /app/apps/timescrape/src/security/seccomp-profile.json ./dist/seccomp-profile.json

USER timescrape
EXPOSE 4000

# node, not wget: node:24-slim installs wget only to build itself and purges it
# in the same layer, so the probe exited 127 (command not found) on every
# interval and the container never left "starting"/"unhealthy" no matter how
# well the runner was serving. node is the one binary this image is guaranteed
# to have.
#
# 127.0.0.1 rather than localhost for the same reason as
# docker-compose.prod.yml:161 -- Node resolves localhost via dns.lookup, which
# answers with the AAAA record first, while the server binds 0.0.0.0 only.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
