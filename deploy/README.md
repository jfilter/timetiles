# Production Deployment Configuration

This directory contains all files needed for production deployment.

## Structure

```
deploy/
├── Dockerfile.prod           # Production multi-stage build
├── docker-compose.prod.yml   # Production orchestration
└── nginx/                    # Nginx configuration
    ├── nginx.conf           # Main nginx config
    └── sites-enabled/       # Site configurations
        ├── default.conf     # HTTP server (port 80)
        ├── app.conf         # HTTPS server (port 443)
        └── initial.conf.template  # Initial setup template
```

## Usage

Three ways to run deployment commands:

```bash
# 1. From project root (recommended)
./deploy.sh build
./deploy.sh up
./deploy.sh ssl

# 2. From deploy directory
cd deploy
./deploy.sh build
./deploy.sh up
./deploy.sh ssl

# 3. Using docker-compose directly
docker-compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.production up -d
```

## Configuration Files

- **Dockerfile.prod**: Multi-stage build optimized for Next.js standalone
- **docker-compose.prod.yml**: Orchestrates all services (nginx, web, postgres, redis, certbot)
- **nginx.conf**: Main nginx configuration with upstreams and includes
- **sites-enabled/**: Per-site nginx configurations for HTTP and HTTPS

## SSL/TLS

SSL certificates are automatically managed by Let's Encrypt:
1. Certbot runs in a separate container
2. Certificates are stored in Docker volumes
3. Auto-renewal checks run every 12 hours
4. Nginx automatically uses the certificates

## Environment Variables

All configuration is done via `.env.production` in this directory.

1. Copy the template: `cp .env.production.example .env.production`
2. Edit with your values: `nano .env.production`
3. See `.env.production.example` for all available options