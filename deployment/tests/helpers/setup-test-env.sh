#!/bin/bash
# Sets up test environment for integration tests
# Run this before running integration tests

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"

echo "=== Setting up test environment ==="

# Check Docker
if ! docker info &>/dev/null; then
    echo "ERROR: Docker is not running"
    exit 1
fi

# Create .env.production if not exists
ENV_FILE="$DEPLOY_DIR/.env.production"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "Creating test .env.production..."
    cp "$DEPLOY_DIR/.env.production.example" "$ENV_FILE"

    # Set test values
    sed -i.bak 's/CHANGE_ME_STRONG_PASSWORD/test_password_123/g' "$ENV_FILE"
    sed -i.bak 's/your-domain.com/localhost/g' "$ENV_FILE"
    sed -i.bak 's/admin@${DOMAIN_NAME}/test@localhost/g' "$ENV_FILE"

    # Generate payload secret
    PAYLOAD_SECRET=$(openssl rand -base64 32 | tr -d '/')
    sed -i.bak "s|PAYLOAD_SECRET=.*|PAYLOAD_SECRET=$PAYLOAD_SECRET|" "$ENV_FILE"

    rm -f "$ENV_FILE.bak"
    echo "Created $ENV_FILE with test values"
fi

# Prepare nginx config
echo "Preparing nginx configuration..."
mkdir -p "$DEPLOY_DIR/nginx-test/sites-enabled"
cp "$DEPLOY_DIR/nginx/nginx.conf" "$DEPLOY_DIR/nginx-test/nginx.conf"
cp -r "$DEPLOY_DIR/nginx/sites-enabled/"* "$DEPLOY_DIR/nginx-test/sites-enabled/"

# Substitute domain name
find "$DEPLOY_DIR/nginx-test/sites-enabled" -type f -name "*.conf" \
    -exec sed -i.bak 's/${DOMAIN_NAME}/localhost/g' {} \;
find "$DEPLOY_DIR/nginx-test/sites-enabled" -name "*.bak" -delete

# Create docker-compose.test.yml override
cat > "$DEPLOY_DIR/docker-compose.test.yml" << EOF
services:
  nginx:
    volumes:
      - $DEPLOY_DIR/nginx-test/nginx.conf:/etc/nginx/nginx.conf:ro
      - $DEPLOY_DIR/nginx-test/sites-enabled:/etc/nginx/sites-enabled:ro
      - $DEPLOY_DIR/ssl:/etc/letsencrypt:ro
      - certbot-webroot:/var/www/certbot:ro

volumes:
  certbot-webroot:
EOF

# Generate self-signed SSL certificate
SSL_DIR="$DEPLOY_DIR/ssl/live/localhost"
if [[ ! -f "$SSL_DIR/fullchain.pem" ]]; then
    echo "Generating self-signed SSL certificate..."
    mkdir -p "$SSL_DIR"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/fullchain.pem" \
        -subj "/C=US/ST=Test/L=Test/O=Test/CN=localhost" 2>/dev/null
    echo "SSL certificate generated"
fi

# Build and start services
echo "Building and starting services..."
cd "$PROJECT_ROOT"

# Use timetiles CLI if available, otherwise docker compose directly
if [[ -x "$DEPLOY_DIR/timetiles" ]]; then
    "$DEPLOY_DIR/timetiles" build || "$DEPLOY_DIR/timetiles" pull
    "$DEPLOY_DIR/timetiles" up
else
    cd "$DEPLOY_DIR"
    docker compose -f docker-compose.prod.yml -f docker-compose.test.yml --env-file .env.production build || \
    docker compose -f docker-compose.prod.yml -f docker-compose.test.yml --env-file .env.production pull
    docker compose -f docker-compose.prod.yml -f docker-compose.test.yml --env-file .env.production up -d
fi

# Wait for health
echo "Waiting for services to be healthy..."
max_attempts=60
attempt=0
while [[ $attempt -lt $max_attempts ]]; do
    if curl -sf http://localhost:80/api/health &>/dev/null || \
       curl -sfk https://localhost/api/health &>/dev/null; then
        echo "Services are healthy!"
        exit 0
    fi
    echo -n "."
    sleep 2
    ((attempt++))
done

echo ""
echo "WARNING: Health check timed out, services may not be fully ready"
exit 0
