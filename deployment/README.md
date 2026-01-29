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

| File | Purpose |
|------|---------|
| `.env.production.example` | Environment template |
| `docker-compose.prod.yml` | Service orchestration |
| `nginx/nginx.conf` | Main nginx config |
| `nginx/sites-enabled/app.conf` | Site config with SSL |
| `nginx/proxy-headers.conf` | Shared proxy headers |

## Environment Variables

Key variables in `.env.production`:

| Variable | Description |
|----------|-------------|
| `DB_USER` | PostgreSQL username (default: `timetiles_user`) |
| `DB_PASSWORD` | PostgreSQL password (required) |
| `DB_NAME` | Database name (default: `timetiles`) |
| `PAYLOAD_SECRET` | CMS encryption key (auto-generated) |
| `DOMAIN_NAME` | Your domain (e.g., `app.example.com`) |
| `LETSENCRYPT_EMAIL` | Email for SSL notifications |

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

## All-in-One Image

For demos or small deployments:

```bash
docker run -d -p 80:80 -p 443:443 \
  -e PAYLOAD_SECRET=your-secret \
  -v timetiles-data:/data \
  ghcr.io/jfilter/timetiles:latest-allinone
```

See `allinone/` for details.
