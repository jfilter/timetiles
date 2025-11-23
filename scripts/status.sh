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

# ============================================================================
# Migration Status
# ============================================================================
echo "🔄 Migration Status:"

if docker compose -f docker-compose.dev.yml ps --services --filter status=running 2>/dev/null | grep -q postgres; then
    # Check if all migrations are applied
    cd apps/web 2>/dev/null || { print_warning "Could not find apps/web directory"; echo ""; exit 0; }

    # Check migration status using Payload
    MIGRATION_OUTPUT=$(pnpm --silent payload migrate:status 2>&1)
    MIGRATION_EXIT=$?

    # Count total migrations and check for pending
    TOTAL_MIGRATIONS=$(echo "$MIGRATION_OUTPUT" | grep "│.*Yes" | wc -l | tr -d ' ' || echo "0")
    PENDING_COUNT=$(echo "$MIGRATION_OUTPUT" | grep "│.*No" | wc -l | tr -d ' ' || echo "0")

    if [ "$MIGRATION_EXIT" -eq 0 ]; then
        if [ "$PENDING_COUNT" -eq 0 ] && [ "$TOTAL_MIGRATIONS" -gt 0 ]; then
            print_success "All migrations applied ($TOTAL_MIGRATIONS total)"
        elif [ "$PENDING_COUNT" -gt 0 ]; then
            print_warning "$PENDING_COUNT pending migration(s) (run 'pnpm --filter web payload migrate')"
        else
            print_info "Migration status checked"
        fi
    else
        print_warning "Could not check migration status"
    fi

    # Check for schema drift (need to create new migration)
    DRIFT_OUTPUT=$(echo "n" | timeout 10s pnpm --silent payload migrate:create --name drift_check 2>&1 || true)

    if echo "$DRIFT_OUTPUT" | grep -q "No schema changes detected"; then
        print_success "Schema is up-to-date (no drift detected)"
    elif echo "$DRIFT_OUTPUT" | grep -q "schema changes detected" || echo "$DRIFT_OUTPUT" | grep -q "The following changes"; then
        print_warning "Schema changes detected (run 'pnpm --filter web payload migrate:create')"
    fi

    # Check if payload-types.ts needs regeneration
    TYPES_BEFORE=$(md5 -q payload-types.ts 2>/dev/null || echo "missing")
    pnpm --silent payload generate:types >/dev/null 2>&1 || true
    TYPES_AFTER=$(md5 -q payload-types.ts 2>/dev/null || echo "missing")

    if [ "$TYPES_BEFORE" = "$TYPES_AFTER" ]; then
        print_success "TypeScript types are up-to-date"
    else
        print_warning "TypeScript types need regeneration (run 'pnpm --filter web payload generate:types')"
        # Restore original file to avoid uncommitted changes
        git checkout payload-types.ts 2>/dev/null || true
    fi

    cd ../.. 2>/dev/null || true
else
    print_missing "Database not running (cannot check migrations)"
fi

echo ""
