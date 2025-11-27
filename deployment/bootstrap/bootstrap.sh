#!/bin/bash
# ============================================================================
# TimeTiles Bootstrap Script
# ============================================================================
# Bootstraps a fresh Ubuntu 24.04 server with TimeTiles
#
# Usage:
#   sudo ./bootstrap.sh                    # Interactive mode
#   sudo ./bootstrap.sh --config FILE      # Use configuration file
#   sudo ./bootstrap.sh --resume           # Resume from last step
#   sudo ./bootstrap.sh --status           # Show progress
#   sudo ./bootstrap.sh --help             # Show help
#
# For one-liner installation, see install.sh
# ============================================================================

set -euo pipefail

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source library files
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/state.sh"
source "$SCRIPT_DIR/lib/prompts.sh"

# ============================================================================
# CONFIGURATION
# ============================================================================
VERSION="1.0.0"
FORCE="${FORCE:-false}"
CONFIG_FILE="${CONFIG_FILE:-}"
SINGLE_STEP="${SINGLE_STEP:-}"
START_FROM="${START_FROM:-}"

# Steps in execution order
STEPS=(
    "01-system-setup"
    "02-docker-install"
    "03-firewall"
    "04-app-user"
    "05-clone-repo"
    "06-configure"
    "07-deploy"
    "08-ssl-setup"
    "09-monitoring"
)

# ============================================================================
# FUNCTIONS
# ============================================================================

print_usage() {
    cat << EOF
TimeTiles Bootstrap Script v$VERSION

Usage: sudo $0 [OPTIONS]

Options:
  --config FILE     Use configuration file
  --resume          Resume from last incomplete step
  --status          Show bootstrap progress
  --step STEP       Run only the specified step
  --from STEP       Start from the specified step
  --force           Force re-run of all steps
  --non-interactive Run without prompts (requires config file)
  --help            Show this help message

Steps:
  01-system-setup   System updates and essential packages
  02-docker-install Docker CE and Docker Compose
  03-firewall       UFW firewall configuration
  04-app-user       Create application user
  05-clone-repo     Clone repository
  06-configure      Generate environment configuration
  07-deploy         Build and start application
  08-ssl-setup      Let's Encrypt SSL certificate
  09-monitoring     Health checks, backups, systemd

Examples:
  # Interactive installation
  sudo ./bootstrap.sh

  # Using configuration file
  sudo ./bootstrap.sh --config /path/to/bootstrap.conf

  # Resume after failure
  sudo ./bootstrap.sh --resume

  # Run specific step
  sudo ./bootstrap.sh --step 06-configure

  # Force fresh start
  sudo ./bootstrap.sh --force

EOF
}

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --config)
                CONFIG_FILE="$2"
                shift 2
                ;;
            --resume)
                # Resume mode - will skip completed steps
                shift
                ;;
            --status)
                show_state "${STEPS[@]}"
                exit 0
                ;;
            --step)
                SINGLE_STEP="$2"
                shift 2
                ;;
            --from)
                START_FROM="$2"
                shift 2
                ;;
            --force)
                FORCE="true"
                shift
                ;;
            --non-interactive)
                NON_INTERACTIVE="true"
                shift
                ;;
            --help|-h)
                print_usage
                exit 0
                ;;
            *)
                print_error "Unknown option: $1"
                print_usage
                exit 1
                ;;
        esac
    done
}

validate_step() {
    local step="$1"
    for valid_step in "${STEPS[@]}"; do
        if [[ "$step" == "$valid_step" ]]; then
            return 0
        fi
    done
    die "Invalid step: $step"
}

run_single_step() {
    local step="$1"

    validate_step "$step"

    print_header "Running Step: $step"

    # Source and run the step
    source "$SCRIPT_DIR/steps/${step}.sh"
    if run_step; then
        mark_completed "$step"
        print_success "Step $step completed"
    else
        die "Step $step failed"
    fi
}

run_all_steps() {
    local skip_until=""
    local started=false

    # If starting from a specific step, skip until we reach it
    if [[ -n "$START_FROM" ]]; then
        validate_step "$START_FROM"
        skip_until="$START_FROM"
    fi

    for step in "${STEPS[@]}"; do
        # Handle --from flag
        if [[ -n "$skip_until" ]]; then
            if [[ "$step" != "$skip_until" ]]; then
                print_skip "$step (skipping until $skip_until)"
                continue
            fi
            skip_until=""
        fi

        # Check if step is already completed (unless --force)
        if [[ "$FORCE" != "true" ]] && is_completed "$step"; then
            print_skip "$step (already completed)"
            continue
        fi

        # Run the step
        print_header "Step: $step"

        source "$SCRIPT_DIR/steps/${step}.sh"
        if run_step; then
            mark_completed "$step"
            print_success "Step $step completed"
        else
            die "Step $step failed"
        fi

        echo ""
    done
}

cleanup() {
    release_lock
}

# ============================================================================
# MAIN
# ============================================================================

main() {
    # Parse command line arguments
    parse_args "$@"

    # Show banner
    print_header "TimeTiles Bootstrap v$VERSION"

    # Validate environment
    check_root
    check_ubuntu
    check_disk_space 10

    # Initialize state management
    init_state

    # Acquire lock to prevent concurrent runs
    if ! acquire_lock; then
        die "Another bootstrap process is running"
    fi

    # Load configuration
    if [[ -n "$CONFIG_FILE" ]]; then
        load_config "$CONFIG_FILE" || die "Failed to load config: $CONFIG_FILE"
    else
        load_config_files
    fi

    # Load any saved state from previous run
    load_config_from_state 2>/dev/null || true

    # Collect configuration (prompts if needed)
    collect_configuration || die "Configuration failed"

    # Run steps
    if [[ -n "$SINGLE_STEP" ]]; then
        run_single_step "$SINGLE_STEP"
    else
        run_all_steps
    fi

    # Release lock
    release_lock

    print_success "Bootstrap completed successfully!"
}

# Run main function with all arguments
main "$@"
