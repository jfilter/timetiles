#!/bin/bash
# Tears down test environment after integration tests

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"

echo "=== Tearing down test environment ==="

cd "$DEPLOY_DIR"

# Stop services
if [[ -x "$DEPLOY_DIR/timetiles" ]]; then
    "$DEPLOY_DIR/timetiles" down || true
else
    docker compose -f docker-compose.prod.yml -f docker-compose.test.yml \
        --env-file .env.production down 2>/dev/null || true
fi

# Clean up test artifacts (optional - keep for debugging)
if [[ "${CLEANUP_ALL:-false}" == "true" ]]; then
    rm -rf "$DEPLOY_DIR/nginx-test"
    rm -f "$DEPLOY_DIR/docker-compose.test.yml"
    rm -rf "$DEPLOY_DIR/ssl"
    rm -rf "$DEPLOY_DIR/backups"
    echo "Cleaned up all test artifacts"
fi

echo "Teardown complete"
