#!/bin/bash
# ============================================================================
# TimeTiles Bootstrap - Multipass Test Script
# ============================================================================
# Tests the bootstrap scripts on a local Ubuntu 24.04 VM using Multipass
#
# Usage:
#   ./test-multipass.sh              # Run full test
#   ./test-multipass.sh --keep       # Keep VM after test
#   ./test-multipass.sh --shell      # Drop into VM shell after bootstrap
#   ./test-multipass.sh --destroy    # Just destroy existing VM
#   ./test-multipass.sh --help       # Show help
#
# Prerequisites:
#   brew install multipass
#
# macOS Non-Admin Account Setup:
#   If you're using a non-admin macOS account, follow these steps:
#
#   1. On an ADMIN account, download and install Multipass from https://multipass.run
#   2. On the ADMIN account, open Terminal and run:
#        multipass set local.passphrase
#      Enter a passphrase when prompted (share this with non-admin users)
#   3. On the NON-ADMIN account, open Terminal and run:
#        multipass authenticate
#      Enter the passphrase set in step 2
#   4. Now you can run multipass commands from the non-admin account
# ============================================================================

set -euo pipefail

# Configuration
VM_NAME="timetiles-test"
VM_CPUS="${VM_CPUS:-2}"
VM_MEMORY="${VM_MEMORY:-6G}"
VM_DISK="${VM_DISK:-20G}"
VM_IMAGE="24.04"

# Test configuration
TEST_DOMAIN="test.local"
TEST_EMAIL="test@test.local"

# Script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Options
KEEP_VM=false
SHELL_AFTER=false
DESTROY_ONLY=false
USE_LOCAL_FILES=false

# ============================================================================
# FUNCTIONS
# ============================================================================

print_header() {
    echo ""
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}══════════════════════════════════════════════════════════════${NC}"
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

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_usage() {
    cat << 'EOF'
TimeTiles Bootstrap - Multipass Test Script

Usage: ./test-multipass.sh [OPTIONS]

Options:
  --keep        Keep VM after test (don't destroy)
  --shell       Drop into VM shell after bootstrap
  --destroy     Just destroy existing VM and exit
  --local       Use local files instead of cloning from GitHub
  --help        Show this help message

Environment Variables:
  VM_CPUS       Number of CPUs (default: 2)
  VM_MEMORY     Memory size (default: 6G)
  VM_DISK       Disk size (default: 20G)

Examples:
  # Run full test
  ./test-multipass.sh

  # Keep VM for inspection
  ./test-multipass.sh --keep

  # Run test and then shell into VM
  ./test-multipass.sh --shell

  # Clean up existing test VM
  ./test-multipass.sh --destroy

macOS Non-Admin Setup:
  If using a non-admin macOS account:

  1. On ADMIN account: Download and install from https://multipass.run
  2. On ADMIN account: multipass set local.passphrase
  3. On NON-ADMIN account: multipass authenticate
  4. Now you can run this script

EOF
}

check_multipass() {
    if ! command -v multipass &>/dev/null; then
        print_error "Multipass is not installed"
        echo ""
        echo "Install with:"
        echo "  brew install multipass"
        echo ""
        exit 1
    fi
    print_success "Multipass is installed"
}

vm_exists() {
    multipass list --format csv 2>/dev/null | grep -q "^${VM_NAME},"
}

vm_running() {
    multipass list --format csv 2>/dev/null | grep "^${VM_NAME}," | grep -q "Running"
}

get_vm_ip() {
    multipass info "$VM_NAME" --format csv 2>/dev/null | tail -1 | cut -d',' -f3
}

destroy_vm() {
    if vm_exists; then
        print_step "Destroying existing VM: $VM_NAME"
        multipass delete "$VM_NAME" --purge 2>/dev/null || true
        print_success "VM destroyed"
    else
        print_info "No existing VM to destroy"
    fi
}

create_vm() {
    if vm_exists; then
        print_info "VM already exists: $VM_NAME"
        if ! vm_running; then
            print_step "Starting VM..."
            multipass start "$VM_NAME"
        fi
    else
        print_step "Creating Ubuntu $VM_IMAGE VM..."
        print_info "  Name: $VM_NAME"
        print_info "  CPUs: $VM_CPUS"
        print_info "  Memory: $VM_MEMORY"
        print_info "  Disk: $VM_DISK"

        multipass launch "$VM_IMAGE" \
            --name "$VM_NAME" \
            --cpus "$VM_CPUS" \
            --memory "$VM_MEMORY" \
            --disk "$VM_DISK"

        print_success "VM created"
    fi

    # Wait for VM to be ready
    print_step "Waiting for VM to be ready..."
    sleep 5

    local ip
    ip=$(get_vm_ip)
    print_success "VM is ready at $ip"
}

transfer_files() {
    print_step "Transferring bootstrap scripts to VM..."

    # Create directory in VM
    multipass exec "$VM_NAME" -- sudo mkdir -p /opt/timetiles-bootstrap
    multipass exec "$VM_NAME" -- sudo chown ubuntu:ubuntu /opt/timetiles-bootstrap

    # Transfer bootstrap directory
    multipass transfer "$SCRIPT_DIR/bootstrap.sh" "${VM_NAME}:/opt/timetiles-bootstrap/"
    multipass transfer "$SCRIPT_DIR/bootstrap.conf.example" "${VM_NAME}:/opt/timetiles-bootstrap/"

    # Transfer lib directory
    multipass exec "$VM_NAME" -- mkdir -p /opt/timetiles-bootstrap/lib
    for f in "$SCRIPT_DIR/lib/"*.sh; do
        multipass transfer "$f" "${VM_NAME}:/opt/timetiles-bootstrap/lib/"
    done

    # Transfer steps directory
    multipass exec "$VM_NAME" -- mkdir -p /opt/timetiles-bootstrap/steps
    for f in "$SCRIPT_DIR/steps/"*.sh; do
        multipass transfer "$f" "${VM_NAME}:/opt/timetiles-bootstrap/steps/"
    done

    # Make scripts executable
    multipass exec "$VM_NAME" -- chmod +x /opt/timetiles-bootstrap/bootstrap.sh
    multipass exec "$VM_NAME" -- bash -c 'chmod +x /opt/timetiles-bootstrap/lib/*.sh'
    multipass exec "$VM_NAME" -- bash -c 'chmod +x /opt/timetiles-bootstrap/steps/*.sh'

    print_success "Files transferred"
}

transfer_local_codebase() {
    print_step "Transferring local codebase to VM..."
    print_info "This includes all local changes not yet pushed to GitHub"

    # Create app directory
    multipass exec "$VM_NAME" -- sudo mkdir -p /opt/timetiles/app
    multipass exec "$VM_NAME" -- sudo chown -R ubuntu:ubuntu /opt/timetiles

    # Create tarball excluding build artifacts and macOS artifacts
    local tarball="/tmp/timetiles-local-$$.tar.gz"
    print_info "Creating tarball of local codebase..."
    # COPYFILE_DISABLE prevents macOS from creating AppleDouble (._*) files in archive
    COPYFILE_DISABLE=1 tar --exclude='node_modules' --exclude='.git' --exclude='.next' \
        --exclude='dist' --exclude='.turbo' --exclude='coverage' \
        --exclude='.test-results.json' \
        --exclude='._*' --exclude='.DS_Store' \
        -czf "$tarball" -C "$PROJECT_ROOT" . 2>/dev/null

    local size
    size=$(du -h "$tarball" | cut -f1)
    print_info "Tarball size: $size"

    # Transfer and extract
    print_info "Transferring to VM..."
    multipass transfer "$tarball" "${VM_NAME}:/tmp/timetiles-local.tar.gz"

    print_info "Extracting..."
    multipass exec "$VM_NAME" -- tar -xzf /tmp/timetiles-local.tar.gz -C /opt/timetiles/app

    # Set ownership to app user (will be created by bootstrap)
    multipass exec "$VM_NAME" -- sudo chown -R ubuntu:ubuntu /opt/timetiles/app

    # Clean up
    rm -f "$tarball"
    multipass exec "$VM_NAME" -- rm -f /tmp/timetiles-local.tar.gz

    print_success "Local codebase transferred"
}

create_test_config() {
    print_step "Creating test configuration..."

    # Determine if we should skip the clone step
    local skip_clone="false"
    if [[ "$USE_LOCAL_FILES" == "true" ]]; then
        skip_clone="true"
    fi

    # Create test config - minimal skips, run as close to production as possible
    # Only skip clone when using local files
    multipass exec "$VM_NAME" -- bash -c "cat > /opt/timetiles-bootstrap/bootstrap.conf << 'EOF'
# Test configuration for Multipass
DOMAIN_NAME=$TEST_DOMAIN
LETSENCRYPT_EMAIL=$TEST_EMAIL
NON_INTERACTIVE=true
SKIP_CLONE=$skip_clone
REPO_URL=https://github.com/jfilter/timetiles.git
REPO_BRANCH=main
EOF"

    print_success "Test configuration created"
}

run_bootstrap() {
    print_header "Running Bootstrap"

    print_info "This will take several minutes..."
    print_info "The bootstrap will:"
    print_info "  1. Update system packages"
    print_info "  2. Install Docker"
    print_info "  3. Create application user"
    print_info "  4. Clone repository"
    print_info "  5. Configure environment"
    print_info "  6. Build and start services"
    print_info "  7. Set up monitoring"
    echo ""

    # Run bootstrap with test config
    if multipass exec "$VM_NAME" -- sudo /opt/timetiles-bootstrap/bootstrap.sh \
        --config /opt/timetiles-bootstrap/bootstrap.conf; then
        print_success "Bootstrap completed successfully!"
        return 0
    else
        print_error "Bootstrap failed"
        return 1
    fi
}

verify_deployment() {
    print_header "Verifying Deployment"

    local ip
    ip=$(get_vm_ip)

    print_step "Checking services..."

    # Check Docker is running
    if multipass exec "$VM_NAME" -- docker ps &>/dev/null; then
        print_success "Docker is running"
    else
        print_error "Docker is not running"
        return 1
    fi

    # List containers
    print_step "Running containers:"
    multipass exec "$VM_NAME" -- docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

    # Wait for app to be ready
    print_step "Waiting for application health check..."
    local attempts=0
    local max_attempts=30

    while [[ $attempts -lt $max_attempts ]]; do
        if multipass exec "$VM_NAME" -- curl -sf http://localhost:3000/api/health &>/dev/null; then
            print_success "Application is healthy!"
            break
        fi
        sleep 10
        attempts=$((attempts + 1))
        echo -n "."
    done
    echo ""

    if [[ $attempts -ge $max_attempts ]]; then
        print_warning "Health check timed out - checking logs..."
        multipass exec "$VM_NAME" -- bash -c "cd /opt/timetiles/app && ./deployment/deploy.sh logs 2>&1 | tail -30"
        return 1
    fi

    # Show health status
    print_step "Health check response:"
    multipass exec "$VM_NAME" -- curl -s http://localhost:3000/api/health | head -20

    return 0
}

show_access_info() {
    local ip
    ip=$(get_vm_ip)

    print_header "Access Information"

    echo "VM Name: $VM_NAME"
    echo "VM IP: $ip"
    echo ""
    echo "Access the application:"
    echo "  http://$ip:3000"
    echo "  http://$ip:3000/admin"
    echo ""
    echo "SSH into VM:"
    echo "  multipass shell $VM_NAME"
    echo ""
    echo "View logs:"
    echo "  multipass exec $VM_NAME -- bash -c 'cd /opt/timetiles/app && ./deployment/deploy.sh logs'"
    echo ""
    echo "Check status:"
    echo "  multipass exec $VM_NAME -- bash -c 'cd /opt/timetiles/app && ./deployment/deploy.sh status'"
    echo ""

    if [[ "$KEEP_VM" == "false" ]]; then
        echo "Destroy VM when done:"
        echo "  multipass delete $VM_NAME --purge"
        echo ""
    fi
}

cleanup() {
    if [[ "$KEEP_VM" == "false" ]] && [[ "$SHELL_AFTER" == "false" ]]; then
        print_step "Cleaning up VM..."
        destroy_vm
    fi
}

# ============================================================================
# MAIN
# ============================================================================

parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --keep)
                KEEP_VM=true
                shift
                ;;
            --shell)
                SHELL_AFTER=true
                KEEP_VM=true  # Implied
                shift
                ;;
            --destroy)
                DESTROY_ONLY=true
                shift
                ;;
            --local)
                USE_LOCAL_FILES=true
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

main() {
    parse_args "$@"

    print_header "TimeTiles Bootstrap Test (Multipass)"

    # Check prerequisites
    check_multipass

    # Handle destroy-only mode
    if [[ "$DESTROY_ONLY" == "true" ]]; then
        destroy_vm
        exit 0
    fi

    # Create or start VM
    create_vm

    # Transfer files
    transfer_files

    # Transfer local codebase if --local is used
    if [[ "$USE_LOCAL_FILES" == "true" ]]; then
        transfer_local_codebase
    fi

    # Create test config
    create_test_config

    # Run bootstrap
    local bootstrap_status=0
    if ! run_bootstrap; then
        bootstrap_status=1
    fi

    # Verify deployment
    if [[ $bootstrap_status -eq 0 ]]; then
        verify_deployment || bootstrap_status=1
    fi

    # Show access info
    show_access_info

    # Shell into VM if requested
    if [[ "$SHELL_AFTER" == "true" ]]; then
        print_info "Dropping into VM shell..."
        print_info "Type 'exit' to leave the VM"
        echo ""
        multipass shell "$VM_NAME"
    fi

    # Cleanup
    if [[ "$KEEP_VM" == "false" ]]; then
        cleanup
    else
        print_info "VM kept running. Destroy with: multipass delete $VM_NAME --purge"
    fi

    if [[ $bootstrap_status -ne 0 ]]; then
        print_error "Test failed!"
        exit 1
    fi

    print_success "Test completed successfully!"
}

main "$@"
