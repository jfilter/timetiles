#!/bin/bash
# ============================================================================
# TimeTiles One-Liner Installation Script
# ============================================================================
# This script is designed to be run via curl:
#
#   curl -sSL https://raw.githubusercontent.com/jfilter/timetiles/main/deployment/bootstrap/install.sh | sudo bash
#
# Or with arguments:
#
#   curl -sSL .../install.sh | sudo bash -s -- --domain example.com --email admin@example.com
#
# ============================================================================

set -euo pipefail

# Configuration
REPO_URL="${REPO_URL:-https://github.com/jfilter/timetiles.git}"
REPO_BRANCH="${REPO_BRANCH:-main}"
TEMP_DIR="/tmp/timetiles-bootstrap-$$"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ============================================================================
# FUNCTIONS
# ============================================================================

print_banner() {
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║                                                                ║${NC}"
    echo -e "${BLUE}║              ${GREEN}TimeTiles Installation Script${BLUE}                    ║${NC}"
    echo -e "${BLUE}║                                                                ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_step() {
    echo -e "${BLUE}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

die() {
    print_error "$1"
    cleanup
    exit 1
}

cleanup() {
    if [[ -d "$TEMP_DIR" ]]; then
        rm -rf "$TEMP_DIR"
    fi
}

trap cleanup EXIT

check_requirements() {
    print_step "Checking requirements..."

    # Must be root
    if [[ $EUID -ne 0 ]]; then
        die "This script must be run as root (use sudo)"
    fi

    # Check for Ubuntu
    if [[ ! -f /etc/os-release ]]; then
        die "Cannot detect OS - /etc/os-release not found"
    fi

    source /etc/os-release
    if [[ "$ID" != "ubuntu" ]]; then
        die "This script requires Ubuntu (detected: $ID)"
    fi

    local version_major="${VERSION_ID%%.*}"
    if [[ "$version_major" -lt 22 ]]; then
        die "This script requires Ubuntu 22.04 or later (detected: $VERSION_ID)"
    fi

    # Check for git
    if ! command -v git &>/dev/null; then
        print_step "Installing git..."
        apt-get update -qq
        apt-get install -y -qq git
    fi

    # Check for curl
    if ! command -v curl &>/dev/null; then
        print_step "Installing curl..."
        apt-get update -qq
        apt-get install -y -qq curl
    fi

    print_success "Requirements satisfied"
}

clone_bootstrap() {
    print_step "Downloading TimeTiles bootstrap scripts..."

    mkdir -p "$TEMP_DIR"
    cd "$TEMP_DIR"

    # Clone only the deployment directory (sparse checkout)
    git clone --depth 1 --filter=blob:none --sparse "$REPO_URL" repo
    cd repo
    git sparse-checkout set deployment/bootstrap

    if [[ ! -f "deployment/bootstrap/bootstrap.sh" ]]; then
        die "Bootstrap script not found in repository"
    fi

    print_success "Bootstrap scripts downloaded"
}

run_bootstrap() {
    print_step "Starting bootstrap..."

    cd "$TEMP_DIR/repo"
    chmod +x deployment/bootstrap/bootstrap.sh
    chmod +x deployment/bootstrap/steps/*.sh

    # Pass all arguments to bootstrap.sh
    ./deployment/bootstrap/bootstrap.sh "$@"
}

print_usage() {
    cat << 'EOF'
TimeTiles One-Liner Installation

Usage:
  curl -sSL <url>/install.sh | sudo bash
  curl -sSL <url>/install.sh | sudo bash -s -- [OPTIONS]

Options:
  --domain NAME     Set domain name
  --email EMAIL     Set Let's Encrypt email
  --branch BRANCH   Use specific branch (default: main)
  --help            Show this help

Examples:
  # Interactive installation
  curl -sSL .../install.sh | sudo bash

  # With domain pre-configured
  curl -sSL .../install.sh | sudo bash -s -- --domain timetiles.example.com --email admin@example.com

  # Use development branch
  curl -sSL .../install.sh | sudo bash -s -- --branch develop

EOF
}

parse_args() {
    local bootstrap_args=()

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --domain)
                export DOMAIN_NAME="$2"
                shift 2
                ;;
            --email)
                export LETSENCRYPT_EMAIL="$2"
                shift 2
                ;;
            --branch)
                REPO_BRANCH="$2"
                shift 2
                ;;
            --help|-h)
                print_usage
                exit 0
                ;;
            *)
                # Pass unknown args to bootstrap.sh
                bootstrap_args+=("$1")
                shift
                ;;
        esac
    done

    # Export for bootstrap.sh
    BOOTSTRAP_ARGS=("${bootstrap_args[@]:-}")
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    print_banner

    parse_args "$@"

    check_requirements
    clone_bootstrap
    run_bootstrap "${BOOTSTRAP_ARGS[@]:-}"

    # Cleanup is handled by trap
}

main "$@"
