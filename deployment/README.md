# Production Deployment

This directory contains production deployment configuration for TimeTiles.

## 📚 Documentation

For complete deployment instructions, see the **[Admin Guide → Deployment](https://docs.timetiles.org/admin-guide/deployment)** documentation.

## Quick Start

```bash
# From project root
./deploy.sh setup  # Create .env.production
./deploy.sh build  # Build Docker images
./deploy.sh up     # Start services
./deploy.sh ssl    # Setup SSL certificates
```

## Files

- `Dockerfile.prod` - Production multi-stage Docker build
- `docker-compose.prod.yml` - Service orchestration
- `.env.production.example` - Configuration template
- `nginx/` - Nginx reverse proxy configuration
- `deploy.sh` - Deployment helper script