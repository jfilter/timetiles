FROM node:24-slim AS builder

WORKDIR /app
COPY package.json tsconfig.json ./
COPY src/ ./src/

RUN npm install --production=false && \
    npx tsup src/index.ts --format esm --dts && \
    npm prune --production

FROM node:24-slim

RUN useradd -m -u 1000 -s /bin/false timescrape
WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY src/security/seccomp-profile.json ./dist/security/seccomp-profile.json

USER timescrape
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4000/health || exit 1

CMD ["node", "dist/index.js"]
