# Docker-Based Deployment Design

> Simplify TimeTiles deployment with pre-built container images on GitHub Container Registry.

## Goals

1. Users pull ready-to-run images instead of building locally
2. Provide an all-in-one image for demos and small deployments
3. Simplify bootstrap scripts to focus on security hardening
4. Target Ubuntu 24.04 for first-party support

## Image Architecture

### Main Application Image

**Repository:** `ghcr.io/jfilter/timetiles`

- Multi-stage build: deps → builder → runner
- Contains only the Next.js standalone build
- ~200-400MB final image
- Tags: `v1.2.0`, `latest`

### All-in-One Image

**Repository:** `ghcr.io/jfilter/timetiles` (with `-allinone` suffix)

- Based on Ubuntu 24.04
- Includes: PostgreSQL 17 + PostGIS 3.5, Nginx, Node.js runtime, the app
- Uses supervisord to manage processes
- Exposes ports 80/443
- Data volumes for `/var/lib/postgresql` and `/app/uploads`
- ~800MB-1GB final image
- Tags: `v1.2.0-allinone`, `latest-allinone`

### What Changes

- Users no longer build locally (unless developing)
- `docker-compose.prod.yml` changes from `build:` to `image:`

## CI/CD Pipeline

### GitHub Actions Workflow

**File:** `.github/workflows/release-images.yml`

**Triggers:** `v*` tags (e.g., `v1.2.0`)

**Jobs:**

1. **Build main image**
   - Checkout code at tag
   - Set up Docker Buildx with layer caching
   - Build multi-platform (linux/amd64, linux/arm64)
   - Push to ghcr.io with tags: `v1.2.0` + `latest`

2. **Build all-in-one image**
   - Uses separate Dockerfile (`Dockerfile.allinone`)
   - Includes supervisord config, nginx config, postgres init
   - Push with tags: `v1.2.0-allinone` + `latest-allinone`

3. **Smoke test**
   - Pull the just-pushed images
   - Run health check against both
   - Fail release if smoke test fails

### Release Process

```bash
git tag v1.2.0
git push origin v1.2.0
# GitHub Actions builds and pushes images
```

## Simplified Bootstrap Scripts

### What Stays (Security Hardening)

- `01-system-setup.sh` - Updates, timezone, basic packages
- `02-docker-install.sh` - Docker CE installation
- `03-firewall.sh` - UFW rules (80, 443, SSH only)
- `10-ssh-hardening.sh` - Disable password auth, root login
- `11-fail2ban.sh` - Brute force protection
- `12-alerting.sh` - Optional monitoring alerts

### What Changes

- `05-clone-repo.sh` → Only clones `deployment/` folder (for compose files and nginx config)
- `07-deploy.sh` → Runs `docker compose pull` instead of building locally

### What Gets Removed

- No more Node.js/pnpm installation on host
- No more local build steps
- No more build-time memory concerns

### User Experience

```bash
# One-liner install (unchanged interface)
curl -sSL https://raw.githubusercontent.com/.../install.sh | sudo bash

# Or for all-in-one:
docker run -d -p 80:80 -v timetiles-data:/data ghcr.io/jfilter/timetiles:latest-allinone
```

**Target:** Ubuntu 24.04 only. Other distros can use the docker-compose file directly.

## Docker Compose Changes

### Updated `docker-compose.prod.yml`

```yaml
services:
  web:
    image: ghcr.io/jfilter/timetiles:${TIMETILES_VERSION:-latest}
    # Remove: build: section entirely
    # Rest stays the same (env vars, healthcheck, depends_on)
```

### New `docker-compose.override.yml.example`

For users who want to build locally (development or customization):

```yaml
services:
  web:
    build:
      context: ..
      dockerfile: deployment/Dockerfile.prod
    image: timetiles-web:local
```

### Simplified `.env.production.example`

- Add: `TIMETILES_VERSION=latest` (or pin to specific version)
- Keep: All other config (DB_PASSWORD, PAYLOAD_SECRET, DOMAIN_NAME, etc.)

### Day-to-Day Operations (Unchanged)

```bash
./deploy.sh up      # Now pulls from registry instead of building
./deploy.sh update  # Pulls latest, restarts
./deploy.sh down    # Same as before
```

## All-in-One Image Details

### Dockerfile.allinone Structure

```dockerfile
FROM ubuntu:24.04

# Install: PostgreSQL 17 + PostGIS, Nginx, Node.js 22
# Copy: supervisord config, nginx config, postgres init scripts
# Copy: Built Next.js app from main image (multi-stage)
# Expose: 80, 443
# Volume: /data (postgres + uploads)
# Entrypoint: supervisord
```

### Supervisord Manages

- PostgreSQL (auto-init on first run)
- Next.js app (node server.js)
- Nginx (reverse proxy + SSL termination)

### Configuration

```bash
docker run -d \
  -p 80:80 -p 443:443 \
  -v timetiles-data:/data \
  -e PAYLOAD_SECRET=your-secret \
  -e ADMIN_EMAIL=admin@example.com \
  ghcr.io/jfilter/timetiles:latest-allinone
```

### SSL Options

- Self-signed cert generated on first boot (for quick demos)
- Mount custom certs at `/data/ssl/`
- Or use with external reverse proxy (Cloudflare, Caddy, etc.)

### Limitations (Documented)

- Single container = no horizontal scaling
- Backup requires stopping container or using pg_dump inside
- Recommended for: demos, small teams, personal use

## Documentation Updates

### New/Updated Pages

1. **Quick Start** (updated)
   - All-in-one: `docker run ...` (3 lines)
   - Production: `docker compose pull && docker compose up` (5 lines)

2. **Deployment Options** (new page)
   - Comparison table: all-in-one vs compose
   - When to use which

3. **Upgrading** (updated)
   - Change `TIMETILES_VERSION` in `.env.production`
   - Run `./deploy.sh update`

### Migration for Existing Users

```bash
# 1. Backup database
./deploy.sh backup

# 2. Update docker-compose.prod.yml (remove build: section, add image:)
git pull

# 3. Pull new images
docker compose pull

# 4. Restart
./deploy.sh down && ./deploy.sh up
```

**Breaking changes:** None
- Environment variables unchanged
- Volume mounts unchanged
- Just switching from local build to pre-built image

## Files to Create/Modify

| File | Action |
|------|--------|
| `.github/workflows/release-images.yml` | Create |
| `deployment/Dockerfile.allinone` | Create |
| `deployment/allinone/supervisord.conf` | Create |
| `deployment/allinone/nginx.conf` | Create |
| `deployment/docker-compose.prod.yml` | Modify |
| `deployment/docker-compose.override.yml.example` | Create |
| `deployment/.env.production.example` | Modify |
| `deployment/bootstrap/steps/05-clone-repo.sh` | Simplify |
| `deployment/bootstrap/steps/07-deploy.sh` | Simplify |
| `apps/docs/content/admin-guide/deployment.mdx` | Update |
| `apps/docs/content/admin-guide/deployment-options.mdx` | Create |
