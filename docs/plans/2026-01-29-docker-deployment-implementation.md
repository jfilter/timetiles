# Docker Deployment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Publish pre-built Docker images to GHCR on tagged releases, simplify deployment to pull-based workflow.

**Architecture:** GitHub Actions builds and pushes multi-arch images (amd64/arm64) on version tags. Main image contains Next.js standalone build. All-in-one image bundles PostgreSQL/PostGIS, Nginx, and the app with supervisord. Bootstrap scripts simplified to pull images instead of building.

**Tech Stack:** Docker Buildx, GitHub Actions, GitHub Container Registry, supervisord, Ubuntu 24.04 base for all-in-one.

---

## Task 1: Create Release Images Workflow

**Files:**
- Create: `.github/workflows/release-images.yml`

**Step 1: Create the workflow file**

```yaml
name: Release Images

on:
  push:
    tags:
      - 'v*'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: ${{ github.repository }}

jobs:
  build-main:
    name: Build Main Image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest

      - name: Build and push main image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: deployment/Dockerfile.prod
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max
          build-args: |
            DATABASE_URL=postgresql://user:pass@localhost:5432/db
            PAYLOAD_SECRET=build-time-placeholder
            NEXT_PUBLIC_PAYLOAD_URL=http://localhost:3000

  build-allinone:
    name: Build All-in-One Image
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
      - uses: actions/checkout@v4
        with:
          lfs: true

      - name: Set up QEMU
        uses: docker/setup-qemu-action@v3

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Extract metadata
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          flavor: |
            suffix=-allinone
          tags: |
            type=semver,pattern={{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=raw,value=latest

      - name: Build and push all-in-one image
        uses: docker/build-push-action@v6
        with:
          context: .
          file: deployment/Dockerfile.allinone
          platforms: linux/amd64,linux/arm64
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  smoke-test:
    name: Smoke Test Images
    needs: [build-main, build-allinone]
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - name: Log in to Container Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Test main image
        run: |
          # Pull the just-built image
          docker pull ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.ref_name }}

          # Start with test database
          docker network create test-net
          docker run -d --name test-db --network test-net \
            -e POSTGRES_DB=timetiles \
            -e POSTGRES_USER=timetiles_user \
            -e POSTGRES_PASSWORD=testpass \
            kartoza/postgis:17-3.5

          # Wait for postgres
          sleep 10

          # Run app container
          docker run -d --name test-app --network test-net \
            -e DATABASE_URL=postgresql://timetiles_user:testpass@test-db:5432/timetiles \
            -e PAYLOAD_SECRET=test-secret-minimum-32-characters-long \
            -e NEXT_PUBLIC_PAYLOAD_URL=http://localhost:3000 \
            -p 3000:3000 \
            ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:${{ github.ref_name }}

          # Wait for app to start
          sleep 30

          # Health check
          curl -f http://localhost:3000/api/health || (docker logs test-app && exit 1)

      - name: Cleanup
        if: always()
        run: |
          docker rm -f test-app test-db 2>/dev/null || true
          docker network rm test-net 2>/dev/null || true
```

**Step 2: Verify workflow syntax**

Run: `actionlint .github/workflows/release-images.yml`
Expected: No errors

**Step 3: Commit**

```bash
git add .github/workflows/release-images.yml
git commit -m "ci: add release-images workflow for GHCR publishing"
```

---

## Task 2: Create All-in-One Dockerfile

**Files:**
- Create: `deployment/Dockerfile.allinone`
- Create: `deployment/allinone/supervisord.conf`
- Create: `deployment/allinone/nginx.conf`
- Create: `deployment/allinone/entrypoint.sh`

**Step 1: Create supervisord configuration**

```ini
; deployment/allinone/supervisord.conf
[supervisord]
nodaemon=true
user=root
logfile=/var/log/supervisor/supervisord.log
pidfile=/var/run/supervisord.pid
childlogdir=/var/log/supervisor

[program:postgresql]
command=/usr/lib/postgresql/17/bin/postgres -D /data/postgresql
user=postgres
autostart=true
autorestart=true
priority=10
stdout_logfile=/var/log/supervisor/postgresql.log
stderr_logfile=/var/log/supervisor/postgresql.log

[program:nextjs]
command=node /app/apps/web/server.js
user=nextjs
directory=/app
autostart=true
autorestart=true
priority=20
startsecs=10
startretries=3
stdout_logfile=/var/log/supervisor/nextjs.log
stderr_logfile=/var/log/supervisor/nextjs.log
environment=NODE_ENV="production",PORT="3000",HOSTNAME="0.0.0.0"

[program:nginx]
command=/usr/sbin/nginx -g "daemon off;"
autostart=true
autorestart=true
priority=30
stdout_logfile=/var/log/supervisor/nginx.log
stderr_logfile=/var/log/supervisor/nginx.log
```

**Step 2: Create nginx configuration for all-in-one**

```nginx
# deployment/allinone/nginx.conf
events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    upstream nextjs {
        server 127.0.0.1:3000;
    }

    server_tokens off;
    client_max_body_size 1024M;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript
               application/json application/javascript application/xml+rss
               image/svg+xml;

    # HTTP server - redirect to HTTPS or serve directly
    server {
        listen 80 default_server;
        server_name _;

        location /.well-known/acme-challenge/ {
            root /var/www/certbot;
        }

        location / {
            # Check if SSL is configured
            if (-f /data/ssl/fullchain.pem) {
                return 301 https://$host$request_uri;
            }
            # Otherwise serve directly
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }

    # HTTPS server (only if certs exist)
    server {
        listen 443 ssl default_server;
        server_name _;

        ssl_certificate /data/ssl/fullchain.pem;
        ssl_certificate_key /data/ssl/privkey.pem;
        ssl_protocols TLSv1.2 TLSv1.3;
        ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
        ssl_prefer_server_ciphers off;

        location / {
            proxy_pass http://nextjs;
            proxy_http_version 1.1;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto https;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection "upgrade";
        }
    }
}
```

**Step 3: Create entrypoint script**

```bash
#!/bin/bash
# deployment/allinone/entrypoint.sh
set -e

DATA_DIR="${DATA_DIR:-/data}"
PG_DATA="$DATA_DIR/postgresql"
UPLOADS_DIR="$DATA_DIR/uploads"
SSL_DIR="$DATA_DIR/ssl"
LOG_DIR="/var/log/supervisor"

# Create directories
mkdir -p "$PG_DATA" "$UPLOADS_DIR" "$SSL_DIR" "$LOG_DIR"
chown -R postgres:postgres "$PG_DATA"
chown -R nextjs:nextjs "$UPLOADS_DIR"

# Initialize PostgreSQL if needed
if [ ! -f "$PG_DATA/PG_VERSION" ]; then
    echo "Initializing PostgreSQL database..."
    su postgres -c "/usr/lib/postgresql/17/bin/initdb -D $PG_DATA"

    # Configure PostgreSQL
    echo "host all all 0.0.0.0/0 md5" >> "$PG_DATA/pg_hba.conf"
    echo "listen_addresses = '127.0.0.1'" >> "$PG_DATA/postgresql.conf"

    # Start PostgreSQL temporarily to create database
    su postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D $PG_DATA -w start"

    # Create user and database
    su postgres -c "psql -c \"CREATE USER ${DB_USER:-timetiles_user} WITH PASSWORD '${DB_PASSWORD:-changeme}';\""
    su postgres -c "psql -c \"CREATE DATABASE ${DB_NAME:-timetiles} OWNER ${DB_USER:-timetiles_user};\""
    su postgres -c "psql -d ${DB_NAME:-timetiles} -c \"CREATE EXTENSION IF NOT EXISTS postgis;\""

    # Stop PostgreSQL (supervisord will start it)
    su postgres -c "/usr/lib/postgresql/17/bin/pg_ctl -D $PG_DATA -w stop"

    echo "PostgreSQL initialized"
fi

# Generate self-signed certificate if none exists
if [ ! -f "$SSL_DIR/fullchain.pem" ]; then
    echo "Generating self-signed SSL certificate..."
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/fullchain.pem" \
        -subj "/CN=${DOMAIN_NAME:-localhost}"
    echo "Self-signed certificate generated"
fi

# Export environment for Next.js
export DATABASE_URL="postgresql://${DB_USER:-timetiles_user}:${DB_PASSWORD:-changeme}@127.0.0.1:5432/${DB_NAME:-timetiles}"
export UPLOAD_DIR="$UPLOADS_DIR"

# Start supervisord
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
```

**Step 4: Create the Dockerfile**

```dockerfile
# deployment/Dockerfile.allinone
# All-in-One TimeTiles image with PostgreSQL, Nginx, and Next.js
# For demos, small deployments, and single-server setups

FROM ubuntu:24.04

ARG DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    # PostgreSQL 17 + PostGIS
    postgresql-17 \
    postgresql-17-postgis-3 \
    # Nginx
    nginx \
    # Node.js 22.x
    curl \
    ca-certificates \
    gnupg \
    # Supervisor
    supervisor \
    # SSL
    openssl \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Create users
RUN useradd -r -s /bin/false nextjs

# Copy supervisord config
COPY deployment/allinone/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Copy nginx config
COPY deployment/allinone/nginx.conf /etc/nginx/nginx.conf

# Copy entrypoint
COPY deployment/allinone/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Build the application (multi-stage from main image)
# This keeps the Dockerfile self-contained
WORKDIR /build

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.12.4 --activate

# Copy source
COPY . .

# Install dependencies and build
RUN pnpm install --frozen-lockfile
WORKDIR /build/apps/web
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://user:pass@localhost:5432/db
ENV PAYLOAD_SECRET=build-time-placeholder
ENV NEXT_PUBLIC_PAYLOAD_URL=http://localhost:3000
RUN pnpm exec next build --experimental-build-mode compile

# Copy built app to final location
WORKDIR /app
RUN cp -r /build/apps/web/.next/standalone/* /app/ \
    && cp -r /build/apps/web/.next/static /app/apps/web/.next/static \
    && cp -r /build/apps/web/public /app/apps/web/public \
    && mkdir -p /app/apps/web/uploads \
    && chown -R nextjs:nextjs /app

# Cleanup build artifacts
RUN rm -rf /build

# Create data directory
RUN mkdir -p /data && chmod 755 /data

# Expose ports
EXPOSE 80 443

# Volume for persistent data
VOLUME ["/data"]

# Environment defaults
ENV DATA_DIR=/data
ENV DB_NAME=timetiles
ENV DB_USER=timetiles_user
ENV DB_PASSWORD=changeme
ENV PAYLOAD_SECRET=change-this-secret-in-production
ENV NODE_ENV=production

ENTRYPOINT ["/entrypoint.sh"]
```

**Step 5: Make entrypoint executable and commit**

```bash
chmod +x deployment/allinone/entrypoint.sh
git add deployment/Dockerfile.allinone deployment/allinone/
git commit -m "feat: add all-in-one Docker image with PostgreSQL, Nginx, supervisord"
```

---

## Task 3: Update docker-compose.prod.yml for Registry Images

**Files:**
- Modify: `deployment/docker-compose.prod.yml:50-60`
- Modify: `deployment/.env.production.example:10-14`

**Step 1: Update docker-compose.prod.yml**

Change the web service from `build` to `image`:

```yaml
  # Web application
  web:
    image: ${TIMETILES_IMAGE:-ghcr.io/jfilter/timetiles}:${TIMETILES_VERSION:-latest}
    container_name: ${COMPOSE_PROJECT_NAME:-timetiles}-web
    restart: unless-stopped
```

Remove the entire `build:` block (lines ~52-58 in current file).

**Step 2: Update .env.production.example**

Replace the image configuration section:

```bash
# Image configuration
# For production, use pre-built images from GitHub Container Registry
TIMETILES_IMAGE=ghcr.io/jfilter/timetiles
TIMETILES_VERSION=latest
# Pin to specific version for stability:
# TIMETILES_VERSION=v1.0.0
```

Remove:
```bash
IMAGE_NAME=timetiles-web
IMAGE_TAG=latest
DOCKERFILE_PATH=deployment/Dockerfile.prod
```

**Step 3: Commit**

```bash
git add deployment/docker-compose.prod.yml deployment/.env.production.example
git commit -m "feat: switch to pre-built GHCR images in docker-compose"
```

---

## Task 4: Create docker-compose.override.yml.example

**Files:**
- Create: `deployment/docker-compose.override.yml.example`

**Step 1: Create override example**

```yaml
# deployment/docker-compose.override.yml.example
#
# Copy to docker-compose.override.yml to build locally instead of pulling from registry.
# Useful for development or customization.
#
# Usage:
#   cp docker-compose.override.yml.example docker-compose.override.yml
#   ./deploy.sh build
#   ./deploy.sh up

services:
  web:
    build:
      context: ..
      dockerfile: deployment/Dockerfile.prod
      args:
        DATABASE_URL: postgresql://${DB_USER:-timetiles_user}:${DB_PASSWORD}@postgres:5432/${DB_NAME:-timetiles}
        PAYLOAD_SECRET: ${PAYLOAD_SECRET}
        NEXT_PUBLIC_PAYLOAD_URL: ${NEXT_PUBLIC_PAYLOAD_URL:-http://localhost:3000}
    image: timetiles-web:local
```

**Step 2: Commit**

```bash
git add deployment/docker-compose.override.yml.example
git commit -m "docs: add docker-compose.override.yml.example for local builds"
```

---

## Task 5: Update deploy.sh for Pull-Based Workflow

**Files:**
- Modify: `deployment/deploy.sh:166-173` (build command)
- Modify: `deployment/deploy.sh:540-548` (update command)

**Step 1: Update build command**

Change the `build)` case to pull by default, build only if override exists:

```bash
    build)
        check_env
        if [ -f "$SCRIPT_DIR/docker-compose.override.yml" ]; then
            echo -e "${YELLOW}Building Docker images locally (override detected)...${NC}"
            $DC_CMD build
            echo -e "${GREEN}Build complete!${NC}"
        else
            echo -e "${YELLOW}Pulling Docker images from registry...${NC}"
            $DC_CMD pull
            echo -e "${GREEN}Pull complete!${NC}"
        fi
        ;;
```

**Step 2: Update the update command**

```bash
    update)
        check_env
        echo -e "${YELLOW}Updating TimeTiles...${NC}"

        # Pull latest compose files
        git pull origin main

        if [ -f "$SCRIPT_DIR/docker-compose.override.yml" ]; then
            echo -e "${YELLOW}Rebuilding local images...${NC}"
            $DC_CMD build web
        else
            echo -e "${YELLOW}Pulling latest images from registry...${NC}"
            $DC_CMD pull
        fi

        $DC_CMD up -d --no-deps web
        echo -e "${GREEN}Update complete! Migrations will run automatically.${NC}"
        ;;
```

**Step 3: Add a new pull command**

Add after the build command:

```bash
    pull)
        check_env
        echo -e "${YELLOW}Pulling Docker images from registry...${NC}"
        $DC_CMD pull
        echo -e "${GREEN}Pull complete!${NC}"
        ;;
```

Update print_usage to include pull:

```bash
    echo "  pull      - Pull images from registry"
```

**Step 4: Commit**

```bash
git add deployment/deploy.sh
git commit -m "feat: update deploy.sh for pull-based workflow"
```

---

## Task 6: Simplify Bootstrap Clone Step

**Files:**
- Modify: `deployment/bootstrap/steps/05-clone-repo.sh`

**Step 1: Simplify to sparse checkout of deployment folder**

Replace the run_step function:

```bash
run_step() {
    local repo_url="${REPO_URL:-https://github.com/jfilter/timetiles.git}"
    local repo_branch="${REPO_BRANCH:-main}"
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local app_dir="$install_dir/app"
    local user="${APP_USER:-timetiles}"
    local skip_clone="${SKIP_CLONE:-false}"

    # Check if we should skip cloning (local files already present)
    if [[ "$skip_clone" == "true" ]]; then
        if [[ -d "$app_dir" ]] && [[ -f "$app_dir/deployment/deploy.sh" ]]; then
            print_info "Skipping clone - local files already present"
            chown -R "$user:$user" "$app_dir"
            print_success "Repository setup complete (using local files)"
            return 0
        else
            print_warning "SKIP_CLONE=true but no files found at $app_dir"
            print_info "Falling back to cloning from repository..."
        fi
    fi

    print_step "Cloning deployment files..."
    print_info "URL: $repo_url"
    print_info "Branch: $repo_branch"
    print_info "Target: $app_dir"

    # Check if already cloned
    if [[ -d "$app_dir/.git" ]]; then
        print_info "Repository already exists, updating..."
        cd "$app_dir" || die "Cannot change to $app_dir"
        sudo -u "$user" git fetch origin
        sudo -u "$user" git checkout "$repo_branch"
        sudo -u "$user" git pull origin "$repo_branch"
        print_success "Repository updated"
    else
        # Remove directory if it exists but isn't a git repo
        if [[ -d "$app_dir" ]]; then
            rm -rf "$app_dir"
        fi

        # Sparse checkout - only deployment folder
        print_step "Cloning deployment files only (sparse checkout)..."
        mkdir -p "$app_dir"
        cd "$app_dir" || die "Cannot change to $app_dir"

        git init
        git remote add origin "$repo_url"
        git config core.sparseCheckout true
        echo "deployment/" > .git/info/sparse-checkout

        retry 3 5 git fetch --depth 1 origin "$repo_branch"
        git checkout "$repo_branch"

        chown -R "$user:$user" "$app_dir"
        print_success "Deployment files cloned"
    fi

    # Verify critical files exist
    print_step "Verifying deployment structure..."

    local required_files=(
        "deployment/deploy.sh"
        "deployment/docker-compose.prod.yml"
        "deployment/.env.production.example"
    )

    for file in "${required_files[@]}"; do
        if [[ ! -f "$app_dir/$file" ]]; then
            die "Missing required file: $file"
        fi
    done

    print_success "Deployment structure verified"
    chmod +x "$app_dir/deployment/deploy.sh"
    print_success "Deployment files ready"
}
```

**Step 2: Commit**

```bash
git add deployment/bootstrap/steps/05-clone-repo.sh
git commit -m "refactor: simplify bootstrap clone to sparse checkout deployment folder"
```

---

## Task 7: Simplify Bootstrap Deploy Step

**Files:**
- Modify: `deployment/bootstrap/steps/07-deploy.sh`

**Step 1: Change from build to pull**

Replace the Docker build section:

```bash
run_step() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local app_dir="$install_dir/app"
    local user="${APP_USER:-timetiles}"

    cd "$app_dir" || die "Cannot change to $app_dir"

    run_as_user() {
        sudo -u "$user" sg docker -c "cd $app_dir && $*"
    }

    # Set up self-signed SSL as fallback
    setup_self_signed_ssl "$app_dir" "$user"

    # Pull Docker images from registry
    print_step "Pulling Docker images from registry..."
    print_info "This may take a few minutes on first run..."

    if ! run_as_user "./deployment/deploy.sh pull"; then
        die "Failed to pull Docker images"
    fi

    print_success "Docker images pulled"

    # Start services
    print_step "Starting services..."

    if ! run_as_user "./deployment/deploy.sh up"; then
        die "Failed to start services"
    fi

    print_success "Services started"

    # Wait for application to be healthy
    print_step "Waiting for application to be ready..."
    sleep 15

    if ! wait_for_health "http://localhost:3000/api/health" 300 10; then
        print_error "Application failed to become healthy"
        print_info "Checking logs..."
        run_as_user "./deployment/deploy.sh logs 2>&1 | tail -50"
        die "Application health check failed"
    fi

    print_step "Verifying services..."
    run_as_user "./deployment/deploy.sh status"

    print_success "Application deployed successfully"
}
```

**Step 2: Commit**

```bash
git add deployment/bootstrap/steps/07-deploy.sh
git commit -m "refactor: change bootstrap deploy from build to pull"
```

---

## Task 8: Update Documentation

**Files:**
- Modify: `apps/docs/content/admin-guide/deployment.mdx`

**Step 1: Update Quick Start section**

Replace the Quick Start section:

```markdown
## Quick Start

### Option 1: Docker Compose (Recommended)

```bash
# 1. Clone deployment files
git clone --depth 1 --filter=blob:none --sparse https://github.com/jfilter/timetiles.git
cd timetiles
git sparse-checkout set deployment

# 2. Configure environment
cp deployment/.env.production.example deployment/.env.production
nano deployment/.env.production
# Set: DOMAIN_NAME, DB_PASSWORD, PAYLOAD_SECRET, LETSENCRYPT_EMAIL

# 3. Pull and start
./deploy.sh pull
./deploy.sh up

# 4. Initialize SSL (after DNS is configured)
./deploy.sh ssl
```

### Option 2: All-in-One Container

For demos, small teams, or quick trials:

```bash
docker run -d \
  -p 80:80 -p 443:443 \
  -v timetiles-data:/data \
  -e PAYLOAD_SECRET=$(openssl rand -base64 32) \
  -e DB_PASSWORD=$(openssl rand -base64 16) \
  ghcr.io/jfilter/timetiles:latest-allinone
```

### Option 3: Automated Server Setup (Ubuntu 24.04)

```bash
curl -sSL https://raw.githubusercontent.com/jfilter/timetiles/main/deployment/bootstrap/install.sh | sudo bash
```
```

**Step 2: Add Deployment Options section**

Add after Quick Start:

```markdown
## Deployment Options

| Option | Best For | Scaling | Maintenance |
|--------|----------|---------|-------------|
| **Docker Compose** | Production, teams | Horizontal (multiple instances) | Standard Docker ops |
| **All-in-One** | Demos, small teams, personal | Single server only | Simple, self-contained |
| **Bootstrap Script** | Fresh Ubuntu servers | Same as Compose | Includes security hardening |

### Docker Compose Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Nginx     │────▶│   Next.js   │────▶│  PostgreSQL │
│  (SSL/TLS)  │     │    App      │     │  + PostGIS  │
└─────────────┘     └─────────────┘     └─────────────┘
```

### All-in-One Architecture

```
┌─────────────────────────────────────────┐
│           Single Container              │
│  ┌───────┐  ┌────────┐  ┌───────────┐  │
│  │ Nginx │──│Next.js │──│ PostgreSQL│  │
│  └───────┘  └────────┘  └───────────┘  │
│         (supervisord manages all)       │
└─────────────────────────────────────────┘
```
```

**Step 3: Update Upgrading section**

```markdown
## Updating Production

### With Pre-built Images (Default)

```bash
# Edit version in .env.production
# TIMETILES_VERSION=v1.2.0

# Pull new images and restart
./deploy.sh update
```

### With Local Builds

If using `docker-compose.override.yml` for local builds:

```bash
git pull
./deploy.sh build
./deploy.sh up
```
```

**Step 4: Commit**

```bash
git add apps/docs/content/admin-guide/deployment.mdx
git commit -m "docs: update deployment guide for registry-based workflow"
```

---

## Task 9: Test Locally

**Files:**
- None (verification only)

**Step 1: Build main image locally**

```bash
docker build -f deployment/Dockerfile.prod -t timetiles-test:local \
  --build-arg DATABASE_URL=postgresql://user:pass@localhost:5432/db \
  --build-arg PAYLOAD_SECRET=test-secret \
  --build-arg NEXT_PUBLIC_PAYLOAD_URL=http://localhost:3000 \
  .
```

Expected: Build succeeds

**Step 2: Build all-in-one image locally**

```bash
docker build -f deployment/Dockerfile.allinone -t timetiles-allinone-test:local .
```

Expected: Build succeeds

**Step 3: Test all-in-one container**

```bash
docker run -d --name timetiles-test \
  -p 8080:80 \
  -e PAYLOAD_SECRET=test-secret-minimum-32-characters-long \
  -e DB_PASSWORD=testpassword \
  timetiles-allinone-test:local

# Wait for startup
sleep 30

# Health check
curl http://localhost:8080/api/health

# Cleanup
docker rm -f timetiles-test
```

Expected: Health check returns `{"status":"ok"}`

**Step 4: Verify deploy.sh pull command works**

```bash
cd deployment
# This will fail without real images, but syntax should be correct
./deploy.sh pull 2>&1 | head -5
```

Expected: Shows "Pulling Docker images from registry..." (then fails because images don't exist yet)

---

## Task 10: Final Commit and Tag

**Files:**
- None (git operations only)

**Step 1: Verify all changes**

```bash
git status
git log --oneline -10
```

**Step 2: Run checks**

```bash
make check-ai
```

Expected: All checks pass

**Step 3: Create summary commit if needed**

If there are uncommitted changes:

```bash
git add -A
git commit -m "chore: finalize Docker deployment implementation"
```

**Step 4: Document next steps**

After merging to main, create the first release:

```bash
git tag v1.0.0
git push origin v1.0.0
```

This will trigger the release-images workflow and publish images to GHCR.
