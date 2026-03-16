#!/usr/bin/env bash

# TimeTiles Worktree Management Script
# Creates git worktrees with proper environment setup (env files, deps, uploads)
#
# Usage:
#   ./scripts/worktree.sh create <name> [branch]   - Create worktree (default: new branch <name> from main)
#   ./scripts/worktree.sh remove <name>             - Remove worktree and its branch
#   ./scripts/worktree.sh list                      - List all worktrees
#   ./scripts/worktree.sh setup <path>              - Set up env/deps in an existing worktree

set -euo pipefail

# Resolve the main repo root (where this script lives)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKTREE_BASE="$REPO_ROOT/.worktrees"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${GREEN}✓${NC} $1"; }
warn()    { echo -e "${YELLOW}⚠${NC}  $1"; }
error()   { echo -e "${RED}✗${NC} $1"; }
header()  { echo -e "\n${BOLD}$1${NC}"; }

# ---------------------------------------------------------------------------
# copy_env_files <target_dir>
# Copies gitignored env files from the main repo into a worktree
# ---------------------------------------------------------------------------
copy_env_files() {
    local target="$1"
    header "Copying environment files"

    local copied=0

    # Root-level env files
    for f in .env .env.local; do
        if [ -f "$REPO_ROOT/$f" ]; then
            cp "$REPO_ROOT/$f" "$target/$f"
            info "Copied $f"
            copied=$((copied + 1))
        else
            warn "No $f in main repo (skipping)"
        fi
    done

    # apps/web env files
    if [ -f "$REPO_ROOT/apps/web/.env.local" ]; then
        mkdir -p "$target/apps/web"
        cp "$REPO_ROOT/apps/web/.env.local" "$target/apps/web/.env.local"
        info "Copied apps/web/.env.local"
        copied=$((copied + 1))
    else
        warn "No apps/web/.env.local in main repo (skipping)"
    fi

    # scraper env if present
    if [ -f "$REPO_ROOT/apps/scraper/.env" ]; then
        mkdir -p "$target/apps/scraper"
        cp "$REPO_ROOT/apps/scraper/.env" "$target/apps/scraper/.env"
        info "Copied apps/scraper/.env"
        copied=$((copied + 1))
    fi

    # deployment env if present
    if [ -f "$REPO_ROOT/deployment/.env.production" ]; then
        mkdir -p "$target/deployment"
        cp "$REPO_ROOT/deployment/.env.production" "$target/deployment/.env.production"
        info "Copied deployment/.env.production"
        copied=$((copied + 1))
    fi

    if [ $copied -eq 0 ]; then
        error "No env files found in main repo — run 'make setup' first"
        return 1
    fi
}

# ---------------------------------------------------------------------------
# install_deps <target_dir>
# ---------------------------------------------------------------------------
install_deps() {
    local target="$1"
    header "Installing dependencies"
    (cd "$target" && pnpm install --frozen-lockfile 2>&1 | tail -3)
    info "Dependencies installed"
}

# ---------------------------------------------------------------------------
# create_uploads <target_dir>
# ---------------------------------------------------------------------------
create_uploads() {
    local target="$1"
    mkdir -p "$target/apps/web/uploads"
}

# ---------------------------------------------------------------------------
# cmd: create <name> [branch]
# ---------------------------------------------------------------------------
cmd_create() {
    local name="${1:?Usage: worktree.sh create <name> [branch]}"
    local branch="${2:-}"
    local wt_dir="$WORKTREE_BASE/$name"

    if [ -d "$wt_dir" ]; then
        error "Worktree '$name' already exists at $wt_dir"
        echo "  Use 'make worktree-rm NAME=$name' to remove it first"
        exit 1
    fi

    mkdir -p "$WORKTREE_BASE"

    header "Creating worktree '$name'"

    # Default branch name to the worktree name if not specified
    if [ -z "$branch" ]; then
        branch="$name"
    fi

    # Check if branch exists
    if git -C "$REPO_ROOT" rev-parse --verify "$branch" >/dev/null 2>&1; then
        git -C "$REPO_ROOT" worktree add "$wt_dir" "$branch"
    else
        # Create new branch from main
        git -C "$REPO_ROOT" worktree add -b "$branch" "$wt_dir" main
    fi
    info "Worktree created at $wt_dir"

    copy_env_files "$wt_dir"
    install_deps "$wt_dir"
    create_uploads "$wt_dir"

    echo ""
    echo -e "${GREEN}✅ Worktree '$name' is ready!${NC}"
    echo ""
    echo "  cd $wt_dir"
    echo ""
}

# ---------------------------------------------------------------------------
# cmd: setup <path>
# Sets up env/deps in an existing worktree (useful for Claude Code worktrees)
# ---------------------------------------------------------------------------
cmd_setup() {
    local target="${1:?Usage: worktree.sh setup <path>}"

    if [ ! -d "$target/.git" ] && [ ! -f "$target/.git" ]; then
        error "'$target' does not appear to be a git worktree"
        exit 1
    fi

    header "Setting up worktree at $target"
    copy_env_files "$target"
    install_deps "$target"
    create_uploads "$target"

    echo ""
    echo -e "${GREEN}✅ Worktree setup complete!${NC}"
}

# ---------------------------------------------------------------------------
# cmd: remove <name>
# ---------------------------------------------------------------------------
cmd_remove() {
    local name="${1:?Usage: worktree.sh remove <name>}"
    local wt_dir="$WORKTREE_BASE/$name"

    if [ ! -d "$wt_dir" ]; then
        error "Worktree '$name' not found at $wt_dir"
        exit 1
    fi

    header "Removing worktree '$name'"

    # Get the branch name before removing
    local branch
    branch=$(git -C "$wt_dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

    git -C "$REPO_ROOT" worktree remove --force "$wt_dir" 2>/dev/null || rm -rf "$wt_dir"
    info "Worktree removed"

    # Clean up the branch if it was created for this worktree
    if [ -n "$branch" ] && [ "$branch" != "HEAD" ] && [ "$branch" != "main" ]; then
        if git -C "$REPO_ROOT" branch -d "$branch" 2>/dev/null; then
            info "Branch '$branch' deleted"
        fi
    fi

    # Prune stale worktree references
    git -C "$REPO_ROOT" worktree prune 2>/dev/null || true

    echo -e "${GREEN}✅ Worktree '$name' removed${NC}"
}

# ---------------------------------------------------------------------------
# cmd: list
# ---------------------------------------------------------------------------
cmd_list() {
    header "Git worktrees"
    git -C "$REPO_ROOT" worktree list

    # Also show which have env files
    if [ -d "$WORKTREE_BASE" ]; then
        echo ""
        header "Worktrees in .worktrees/"
        for d in "$WORKTREE_BASE"/*/; do
            [ -d "$d" ] || continue
            local name
            name=$(basename "$d")
            local env_status=""
            [ -f "$d/.env" ] && env_status+=".env " || env_status+="(no .env) "
            [ -f "$d/apps/web/.env.local" ] && env_status+="web/.env.local " || env_status+="(no web/.env.local) "
            [ -d "$d/node_modules" ] && env_status+="deps:✓" || env_status+="deps:✗"
            echo "  $name  —  $env_status"
        done
    fi
}

# ---------------------------------------------------------------------------
# Main dispatch
# ---------------------------------------------------------------------------
case "${1:-help}" in
    create) shift; cmd_create "$@" ;;
    remove) shift; cmd_remove "$@" ;;
    setup)  shift; cmd_setup "$@" ;;
    list)   shift; cmd_list "$@" ;;
    *)
        echo "Usage: worktree.sh <command> [args]"
        echo ""
        echo "Commands:"
        echo "  create <name> [branch]  Create a new worktree (default: branch <name> from main)"
        echo "  remove <name>           Remove a worktree"
        echo "  setup <path>            Set up env/deps in an existing worktree"
        echo "  list                    List all worktrees and their status"
        exit 1
        ;;
esac
