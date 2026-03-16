# TimeScrape Runner

Thin, stateless service that executes user-defined scrapers in isolated Podman containers. Part of the TimeTiles monorepo — see ADR 0015 for architecture.

## What This Does

One job: receive code + config via API, run it in a Podman container, return CSV + logs. No database, no user management, no scheduling — that all lives in `apps/web`.

## Commands

```bash
make scraper-dev          # Start dev server (port 4000)
make scraper-test         # Run tests
make scraper-images       # Build Podman base images
make check-ai PACKAGE=scraper  # Lint + typecheck
```

Or directly:

```bash
pnpm --filter scraper dev
pnpm --filter scraper test
pnpm --filter scraper typecheck
```

## API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST | /run | Bearer | Execute scraper in Podman container |
| POST | /stop/:runId | Bearer | Kill running container |
| GET | /status/:runId | Bearer | Check if run is active |
| GET | /health | None | Health check |

Auth: `Authorization: Bearer {SCRAPER_API_KEY}` (shared with apps/web).

## Environment Variables

See `apps/scraper/.env.example` for all variables. Required: `SCRAPER_API_KEY` (min 16 chars).

## Key Files

- `src/index.ts` — Hono server + auth middleware
- `src/services/runner.ts` — Podman container lifecycle
- `src/security/container-config.ts` — Hardening flags builder
- `src/security/seccomp-profile.json` — Allowed syscalls
- `images/python/` — Python base image + timescrape helper
- `images/node/` — Node.js base image + @timescrape/helper

## Security

Every container runs with: rootless Podman, `--cap-drop=ALL`, `--no-new-privileges`, custom seccomp, read-only rootfs, PID/memory/CPU limits, isolated network. See ADR 0015.
