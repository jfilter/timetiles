# Production Deployment

This directory contains production deployment configuration for TimeTiles.

## Documentation

For complete deployment instructions, see the **[Admin Guide → Deployment](https://docs.timetiles.io/admin-guide/deployment)** documentation.

## Quick Start

After bootstrap, the `timetiles` CLI is available system-wide:

```bash
timetiles status     # Check service health
timetiles logs       # View logs
timetiles backup     # Create backup
timetiles check      # Full deployment verification
```

## Installation

### Bootstrap (Recommended)

For fresh Ubuntu 24.04 servers:

```bash
curl -fsSL https://raw.githubusercontent.com/jfilter/timetiles/main/deployment/bootstrap/install.sh | sudo bash
```

This installs to `/opt/timetiles/` and creates `/usr/local/bin/timetiles` symlink.

### Manual Setup

```bash
# Clone deployment files to /opt/timetiles
./timetiles setup    # Create .env.production
./timetiles pull     # Pull Docker images
./timetiles up       # Start services
./timetiles ssl      # Setup Let's Encrypt SSL

# Create system-wide symlink
sudo ln -sf /opt/timetiles/timetiles /usr/local/bin/timetiles
```

## CLI Commands

```bash
timetiles setup      # Initial setup (copy env, generate secrets)
timetiles pull       # Pull images from registry
timetiles build      # Build locally (if override exists) or pull
timetiles up         # Start all services
timetiles down       # Stop all services
timetiles restart    # Restart all services
timetiles logs       # View logs (follow mode)
timetiles status     # Check service health
timetiles check      # Comprehensive deployment verification
timetiles ssl        # Initialize Let's Encrypt certificate
timetiles update     # Pull latest code/images and redeploy
timetiles backup     # Backup management (full|db|uploads|auto|list|prune|verify|clean)
timetiles restore    # Restore from backup
```

## Directory Structure

After installation:

```
/opt/timetiles/
├── timetiles                    # CLI script
├── docker-compose.prod.yml      # Service definitions
├── .env.production              # Configuration (created by setup)
├── nginx/                       # Nginx configs
├── backups/                     # Backup files
└── credentials.txt              # Generated credentials
```

## Configuration Files

| File                           | Purpose               |
| ------------------------------ | --------------------- |
| `.env.production.example`      | Environment template  |
| `docker-compose.prod.yml`      | Service orchestration |
| `nginx/nginx.conf`             | Main nginx config     |
| `nginx/sites-enabled/app.conf` | Site config with SSL  |
| `nginx/proxy-headers.conf`     | Shared proxy headers  |

## Environment Variables

Key variables in `.env.production`:

| Variable            | Description                                     |
| ------------------- | ----------------------------------------------- |
| `DB_USER`           | PostgreSQL username (default: `timetiles_user`) |
| `DB_PASSWORD`       | PostgreSQL password (required)                  |
| `DB_NAME`           | Database name (default: `timetiles`)            |
| `PAYLOAD_SECRET`    | CMS encryption key (auto-generated)             |
| `DOMAIN_NAME`       | Your domain (e.g., `app.example.com`)           |
| `LETSENCRYPT_EMAIL` | Email for SSL notifications                     |

## Backup System

Uses restic for encrypted, deduplicated backups.

```bash
./timetiles backup              # Full backup (db + uploads)
./timetiles backup --offsite    # Include S3 offsite sync
./timetiles backup list         # Show snapshots
./timetiles backup prune        # Apply retention policy
./timetiles restore latest      # Restore most recent
```

Configuration in `.env.production`:

- `RESTIC_PASSWORD` - Encryption key (auto-generated)
- `RESTIC_REPOSITORY` - Local repo path
- `RESTIC_OFFSITE_REPOSITORY` - S3 URL (optional)

## Troubleshooting

### PostgreSQL Connection Issues

The kartoza/postgis image requires TCP connections:

```bash
# Use -h localhost to force TCP
pg_isready -h localhost -U timetiles_user -d timetiles
```

### SSL Certificate Issues

Self-signed certificates are generated automatically as fallback. For Let's Encrypt:

1. Ensure DNS points to your server: `dig your-domain.com`
2. Run: `timetiles ssl`
3. Verify: `timetiles check` (SSL section)

### Container Health

```bash
timetiles status   # Quick check
timetiles check    # Full verification
timetiles logs     # View all logs
```

## Scraper Runner (Optional)

The scraper runner executes user-defined web scrapers in isolated Podman containers. It runs as a **systemd service** (not in Docker Compose) because it needs rootless Podman access on the host.

### Why not in docker-compose?

Podman containers can't be launched from inside Docker — the runner needs direct access to the host's Podman socket (`/run/user/UID/podman/podman.sock`). Running it as a systemd service under the `timetiles` user preserves rootless isolation.

### How it connects

The web app reaches the runner via `SCRAPER_RUNNER_URL` (typically `http://host.docker.internal:4000`). The runner authenticates requests using a shared `SCRAPER_API_KEY`.

### Enabling scrapers

During bootstrap, pass `--scraper` or set `SKIP_SCRAPER=false` in your bootstrap config. This runs step 13 which:

1. Installs Podman (rootless)
2. Builds base images (`timescrape-python`, `timescrape-node`)
3. Creates the `scraper-sandbox` network (no internet access for containers)
4. Installs the runner as a systemd service
5. Generates and configures `SCRAPER_API_KEY`

For manual setup, see `apps/scraper/docs/SETUP.md`.

### Backup considerations

Scraper run history and metadata are stored in PostgreSQL and included in database backups. Container execution data is ephemeral — it's discarded after each run completes.

### Commands

```bash
timetiles logs --scraper # View runner logs (journalctl)
timetiles status         # Includes runner health if configured
timetiles check          # Includes Podman, base images, sandbox network checks
timetiles update         # Updates runner + base images alongside main app
```

## All-in-One Image

For demos or small deployments. Does **not** include the scraper runner (requires Podman, which can't run inside Docker).

```bash
docker run -d -p 80:80 -p 443:443 \
  -e POSTGRES_PASSWORD=your-password \
  -e PAYLOAD_SECRET=your-secret \
  -v timetiles-data:/data \
  ghcr.io/jfilter/timetiles:latest-allinone
```

See `allinone/` for details.
