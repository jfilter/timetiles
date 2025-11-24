#!/usr/bin/env bash

# TimeTiles Environment Validation Script
# Checks prerequisites and setup completion

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Status symbols
SUCCESS="✅"
MISSING="❌"
WARNING="⚠️"
INFO="ℹ️"

# Track failures
FAILED=0

# Print colored message
print_success() { echo -e "  ${GREEN}${SUCCESS}${NC} $1"; }
print_missing() { echo -e "  ${RED}${MISSING}${NC} $1"; FAILED=1; }
print_warning() { echo -e "  ${YELLOW}${WARNING}${NC}  $1"; }

echo "🔍 Development Environment Validation"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ============================================================================
# Prerequisites Check
# ============================================================================
check_prerequisites() {
    echo "🔧 Prerequisites:"

    # Bash
    if command -v bash >/dev/null 2>&1; then
        VERSION=$(bash --version | head -n1 | cut -d' ' -f4 | cut -d'(' -f1)
        print_success "bash ($VERSION)"
    else
        print_missing "bash not found"
    fi

    # Git
    if command -v git >/dev/null 2>&1; then
        VERSION=$(git --version | cut -d' ' -f3)
        print_success "git ($VERSION)"
    else
        print_missing "git not found"
    fi

    # Git LFS
    if command -v git-lfs >/dev/null 2>&1; then
        VERSION=$(git-lfs --version | cut -d' ' -f1 | cut -d'/' -f2)
        print_success "git-lfs ($VERSION)"
    else
        print_missing "git-lfs not found"
    fi

    # Make
    if command -v make >/dev/null 2>&1; then
        VERSION=$(make --version | head -n1 | cut -d' ' -f3)
        print_success "make ($VERSION)"
    else
        print_missing "make not found"
    fi

    # Node.js
    if command -v node >/dev/null 2>&1; then
        VERSION=$(node --version)
        print_success "node ($VERSION)"
    else
        print_missing "node not found"
    fi

    # pnpm
    if command -v pnpm >/dev/null 2>&1; then
        VERSION=$(pnpm --version)
        print_success "pnpm ($VERSION)"
    else
        print_missing "pnpm not found"
    fi

    # Docker
    if command -v docker >/dev/null 2>&1; then
        VERSION=$(docker --version | cut -d' ' -f3 | tr -d ',')
        print_success "docker ($VERSION)"
    else
        print_missing "docker not found"
    fi

    # Docker Compose
    if docker compose version >/dev/null 2>&1; then
        print_success "docker compose"
    else
        print_missing "docker compose not found"
    fi

    # jq (JSON processor for scripts)
    if command -v jq >/dev/null 2>&1; then
        VERSION=$(jq --version | cut -d'-' -f2)
        print_success "jq ($VERSION)"
    else
        print_missing "jq not found (install: brew install jq / apt install jq)"
    fi

    # curl (for API calls and health checks)
    if command -v curl >/dev/null 2>&1; then
        VERSION=$(curl --version | head -n1 | cut -d' ' -f2)
        print_success "curl ($VERSION)"
    else
        print_missing "curl not found (install: brew install curl / apt install curl)"
    fi

    echo ""
}

# ============================================================================
# Setup Status Check
# ============================================================================
check_setup_status() {
    echo "📦 Setup Status:"

    # Root .env file
    if [ -f .env ]; then
        print_success ".env exists"
    else
        print_missing ".env missing → Run 'make setup'"
    fi

    # Web app .env.local file
    if [ -f apps/web/.env.local ]; then
        print_success "apps/web/.env.local exists"
    else
        print_missing "apps/web/.env.local missing → Run 'make setup'"
    fi

    # Dependencies
    if [ -d node_modules ]; then
        print_success "Dependencies installed (node_modules)"
    else
        print_missing "Dependencies not installed → Run 'make setup'"
    fi

    # Git commit template (optional)
    if git config commit.template >/dev/null 2>&1; then
        print_success "Git commit template configured"
    else
        print_warning "Git commit template not configured (optional)"
    fi

    # Git LFS initialization status
    if git lfs env >/dev/null 2>&1; then
        print_success "Git LFS initialized"
    else
        print_missing "Git LFS not initialized → Run 'make setup'"
    fi

    echo ""
}

# ============================================================================
# Main Validation Flow
# ============================================================================
check_prerequisites
check_setup_status

# ============================================================================
# Summary
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $FAILED -eq 0 ]; then
    echo "✅ Environment ready! Run 'make dev' to start."
    exit 0
else
    echo "❌ Environment incomplete. Run 'make setup' to fix."
    exit 1
fi
