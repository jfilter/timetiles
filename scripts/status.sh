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
    print_success "PostgreSQL is running"

    # Check database connectivity
    if docker exec timetiles-postgres pg_isready -U timetiles_user >/dev/null 2>&1; then
        print_success "Database is accepting connections"
    else
        print_warning "Database not ready yet"
    fi
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
# Database Information
# ============================================================================
echo "💾 Database Info:"

if docker compose -f docker-compose.dev.yml ps --services --filter status=running 2>/dev/null | grep -q postgres; then
    SIZE=$(docker exec timetiles-postgres psql -U timetiles_user -d timetiles -t -c "SELECT pg_size_pretty(pg_database_size('timetiles')) as size;" 2>/dev/null | xargs)

    if [ -n "$SIZE" ]; then
        echo -e "  📦 Database size: $SIZE"
    else
        print_warning "Could not retrieve database size"
    fi
fi

echo ""
