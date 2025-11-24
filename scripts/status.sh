#!/usr/bin/env bash

# TimeTiles Development Environment Status Script
# Shows runtime status of services and infrastructure

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Status symbols
SUCCESS="✅"
MISSING="❌"
WARNING="⚠️"
INFO="ℹ️"

# Print colored message
print_success() { echo -e "  ${GREEN}${SUCCESS}${NC} $1"; }
print_missing() { echo -e "  ${RED}${MISSING}${NC} $1"; }
print_warning() { echo -e "  ${YELLOW}${WARNING}${NC}  $1"; }
print_info() { echo -e "  ${BLUE}${INFO}${NC}  $1"; }

echo "📊 Development Environment Status"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ============================================================================
# Docker Infrastructure Status
# ============================================================================
echo "🐳 Docker Infrastructure:"

if docker compose -f docker-compose.dev.yml ps --services --filter status=running 2>/dev/null | grep -q postgres; then
    print_success "PostgreSQL container is running"
else
    print_missing "PostgreSQL is not running (run 'make up')"
fi

echo ""

# ============================================================================
# Development Servers Status
# ============================================================================
echo "🚀 Development Servers:"

if pgrep -f "next dev" >/dev/null 2>&1; then
    print_success "Next.js dev server is running"
else
    print_missing "Next.js dev server is not running (run 'make dev')"
fi

if pgrep -f "turbo" >/dev/null 2>&1; then
    print_success "Turbo is running"
else
    print_info "Turbo is not running"
fi

echo ""

# ============================================================================
# Application Health Checks (via API)
# ============================================================================
echo "🏥 Application Health:"

# Check if dev server is running (prerequisite for API call)
if ! pgrep -f "next dev" >/dev/null 2>&1; then
    print_info "Dev server not running (run 'make dev' to see health checks)"
    echo ""
    exit 0
fi

# Check if jq is installed
if ! command -v jq >/dev/null 2>&1; then
    print_warning "jq not installed (install with: brew install jq)"
    echo ""
    exit 0
fi

# Call health endpoint
HEALTH_JSON=$(curl -s http://localhost:3000/api/health 2>/dev/null)
CURL_EXIT=$?

if [ "$CURL_EXIT" -ne 0 ] || [ -z "$HEALTH_JSON" ]; then
    print_warning "Could not reach health endpoint at http://localhost:3000/api/health"
    echo ""
    exit 0
fi

# Helper function to display health check result
display_health_check() {
    local CHECK_NAME="$1"
    local JSON_KEY="$2"

    STATUS=$(echo "$HEALTH_JSON" | jq -r ".$JSON_KEY.status" 2>/dev/null)
    MESSAGE=$(echo "$HEALTH_JSON" | jq -r ".$JSON_KEY.message" 2>/dev/null)

    if [ "$STATUS" = "healthy" ]; then
        print_success "$CHECK_NAME: $MESSAGE"
    elif [ "$STATUS" = "degraded" ]; then
        print_warning "$CHECK_NAME: $MESSAGE"
    elif [ "$STATUS" = "error" ]; then
        print_missing "$CHECK_NAME: $MESSAGE"
    else
        print_info "$CHECK_NAME: Status unknown"
    fi
}

# Display all health checks
display_health_check "Environment variables" "env"
display_health_check "Uploads directory" "uploads"
display_health_check "Geocoding service" "geocoding"
display_health_check "Payload CMS" "cms"
display_health_check "Migrations" "migrations"
display_health_check "PostGIS extension" "postgis"
display_health_check "Database functions" "dbFunctions"

# Special handling for database size (show the size value)
DB_SIZE=$(echo "$HEALTH_JSON" | jq -r '.dbSize.message' 2>/dev/null)
if [ -n "$DB_SIZE" ] && [ "$DB_SIZE" != "null" ]; then
    echo -e "  📦 Database size: $DB_SIZE"
fi

echo ""
