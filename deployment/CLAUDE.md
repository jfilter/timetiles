# Deployment Package Instructions

> Production deployment tooling for TimeTiles.

## Overview

This folder contains everything needed to deploy TimeTiles to production:

- **`timetiles`** - Main CLI for managing deployments (pull, up, down, backup, restore, check)
- **`docker-compose.prod.yml`** - Production Docker stack (PostgreSQL/PostGIS, Next.js app, Nginx, Certbot)
- **`bootstrap/`** - Server provisioning scripts for fresh Ubuntu 24.04 servers
- **`nginx/`** - Nginx configuration with SSL termination
- **`allinone/`** - All-in-one Docker image for demos

## Key Commands

```bash
./timetiles check    # Verify all deployment aspects (security, docker, app, SSL)
./timetiles status   # Quick health check
./timetiles backup   # Backup management
./timetiles restore  # Restore from backup
```

## Shared Code

- **`bootstrap/lib/common.sh`** - Shared utilities and verification functions
- **`nginx/proxy-headers.conf`** - DRY proxy headers included by both prod and allinone nginx configs
- **`nginx/security-headers.conf`** - Shared security headers (CSP, X-Frame-Options, etc.)
- **`nginx/security-headers-https.conf`** - HTTPS security headers (adds HSTS on top of base)

## Variable Naming

Use `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `.env.production` and bootstrap scripts. `docker-compose.prod.yml` maps these to `POSTGRES_*` internally for kartoza image compatibility — don't use `POSTGRES_*` directly in user-facing config.

## Scraper Runner

The scraper runs as a **systemd service**, not in docker-compose. This is because Podman containers can't be launched from inside Docker — the runner needs host-level Podman socket access. Bootstrap step 13 handles setup (opt-in via `SKIP_SCRAPER=false`).

Key points:
- Web app reaches runner via `SCRAPER_RUNNER_URL` (typically `http://host.docker.internal:4000`)
- `SCRAPER_API_KEY` must match in both `.env.production` (web) and runner env
- Run history is in PostgreSQL (backed up); container data is ephemeral (not backed up)
- All-in-one image does **not** include the scraper (Podman can't run inside Docker)

## Testing

Three levels of deployment tests:

```bash
# Unit tests (no Docker, fast)
make test-deploy-unit              # or: npx bats deployment/tests/unit/*.bats

# Integration tests (needs Docker running)
bash deployment/tests/helpers/setup-test-env.sh   # start full stack
npx bats deployment/tests/integration/*.bats      # run tests
bash deployment/tests/helpers/teardown-test-env.sh # clean up

# VM tests (full bootstrap in Vagrant/VirtualBox — most thorough)
cd deployment/tests
./run-vm.sh              # Run tests (reuses existing VM)
./run-vm.sh --fresh      # Destroy and recreate VM
./run-vm.sh --shell      # Shell into VM for debugging
./run-vm.sh --destroy    # Clean up VM
```

Requires: Vagrant (`brew install --cask vagrant`) and VirtualBox 7.1+.

## Backup/Restore

Tested automatically in `.github/workflows/release-images.yml` (daily edge builds and tagged releases):
- Database-only backup/restore
- Full backup/restore (database + uploads)
- Field-level verification of restored data

## CI Image Override

The test environment supports CI-provided images via environment variables:
- `TIMETILES_IMAGE` - Override the Docker image name
- `TIMETILES_VERSION` - Override the image tag
- `SKIP_IMAGE_BUILD=true` - Skip build/pull when using a pre-loaded image
