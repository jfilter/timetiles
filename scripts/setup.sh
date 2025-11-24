#!/usr/bin/env bash

# TimeTiles Development Setup Script
# This script performs complete first-time setup for the TimeTiles monorepo
# It is idempotent - safe to run multiple times

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Status symbols
SUCCESS="✅"
ALREADY_EXISTS="✓"
WARNING="⚠️"
ERROR="❌"

# Print colored message
print_success() { echo -e "${GREEN}${SUCCESS}${NC} $1"; }
print_exists() { echo -e "  ${ALREADY_EXISTS} $1"; }
print_warning() { echo -e "${YELLOW}${WARNING}${NC}  $1"; }
print_error() { echo -e "${RED}${ERROR}${NC} $1"; }

# Track if any warnings occurred
WARNINGS=0

echo "🚀 TimeTiles Development Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ============================================================================
# Step 1: Environment Files
# ============================================================================
setup_env_files() {
    echo "📝 Environment Files"

    # Root .env file
    if [ -f .env.example ]; then
        if [ ! -f .env ]; then
            cp .env.example .env
            print_success "Created .env"
        else
            print_exists ".env already exists (skipping)"
        fi
    else
        print_error ".env.example not found"
        exit 1
    fi

    # Web app .env.local file (CRITICAL - this was missing!)
    if [ -f apps/web/.env.example ]; then
        if [ ! -f apps/web/.env.local ]; then
            cp apps/web/.env.example apps/web/.env.local
            print_success "Created apps/web/.env.local"
        else
            print_exists "apps/web/.env.local already exists (skipping)"
        fi
    else
        print_warning "apps/web/.env.example not found"
        WARNINGS=$((WARNINGS + 1))
    fi

    echo ""
}

# ============================================================================
# Step 2: Upload Directories
# ============================================================================
create_upload_directories() {
    echo "📁 Upload Directories"

    # Create uploads directory in web app
    if [ ! -d apps/web/uploads ]; then
        mkdir -p apps/web/uploads
        print_success "Created apps/web/uploads"
    else
        print_exists "apps/web/uploads already exists"
    fi

    echo ""
}

# ============================================================================
# Step 3: Dependencies
# ============================================================================
install_dependencies() {
    echo "📦 Dependencies"

    if ! command -v pnpm >/dev/null 2>&1; then
        print_error "pnpm not found. Please install pnpm first:"
        echo "  npm install -g pnpm"
        exit 1
    fi

    if pnpm install; then
        print_success "Installed successfully"
    else
        print_error "pnpm install failed"
        exit 1
    fi

    echo ""
}

# ============================================================================
# Step 4: Git LFS (Required)
# ============================================================================
setup_git_lfs() {
    echo "🗂️  Git LFS"

    if ! command -v git-lfs >/dev/null 2>&1; then
        print_error "Git LFS not installed. Please install Git LFS first:"
        echo "  macOS:  brew install git-lfs"
        echo "  Ubuntu: sudo apt-get install git-lfs"
        echo "  Windows: https://git-lfs.github.com/"
        exit 1
    fi

    # Check if already initialized
    if git lfs install >/dev/null 2>&1; then
        print_success "Git LFS initialized"
    else
        print_exists "Git LFS already initialized"
    fi

    # Try to pull assets
    if git lfs pull 2>&1 | grep -qi "error"; then
        print_warning "Git LFS pull failed (may need credentials)"
        WARNINGS=$((WARNINGS + 1))
    else
        print_success "Image assets downloaded"
    fi

    echo ""
}

# ============================================================================
# Step 5: Git Commit Template (Optional - for conventional commits)
# ============================================================================
setup_git_config() {
    echo "🔧 Git Configuration"

    if [ -f scripts/setup-git.sh ]; then
        # Use existing setup-git.sh script
        if ./scripts/setup-git.sh >/dev/null 2>&1; then
            print_success "Commit template configured"
        else
            print_warning "Git config failed (non-critical)"
            WARNINGS=$((WARNINGS + 1))
        fi
    elif [ -f .gitmessage ]; then
        # Fallback: configure directly
        if git config commit.template .gitmessage 2>/dev/null; then
            print_success "Commit template configured"
        else
            print_warning "Git config failed (non-critical)"
            WARNINGS=$((WARNINGS + 1))
        fi
    else
        print_warning ".gitmessage template not found (skipping)"
        WARNINGS=$((WARNINGS + 1))
    fi

    echo ""
}

# ============================================================================
# Main Setup Flow
# ============================================================================
setup_env_files
create_upload_directories
install_dependencies
setup_git_lfs
setup_git_config

# ============================================================================
# Summary
# ============================================================================
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ $WARNINGS -eq 0 ]; then
    echo "✅ Setup Complete! (no warnings)"
else
    echo "✅ Setup Complete! ($WARNINGS warnings - see above)"
fi
echo ""
echo "📋 Next Steps:"
echo "  1. Review apps/web/.env.local and customize as needed"
echo "  2. Run 'make dev' to start development"
echo ""
echo "💡 Useful commands:"
echo "  make status    - Check environment health"
echo "  make help      - Show all available commands"
echo ""
