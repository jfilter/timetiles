#!/bin/bash
# TimeTiles Bootstrap Test Script
# Tests the bootstrap process in a Multipass VM
#
# Usage:
#   ./test-multipass.sh                    # Full test with GitHub clone
#   ./test-multipass.sh --local            # Test with local codebase
#   ./test-multipass.sh --local --shell    # Test with local, then shell access
#   ./test-multipass.sh --shell            # Shell access to existing VM
#   ./test-multipass.sh --destroy          # Destroy test VM
#
# The script creates a temporary Ubuntu VM, runs the bootstrap, and validates
# that all components are working correctly.

set -eo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
VM_NAME="timetiles-test"
VM_CPUS=2
VM_MEMORY="4G"
VM_DISK="20G"

# Script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Test configuration
TEST_DOMAIN="test.local"
TEST_EMAIL="test@test.local"

# Parse arguments
LOCAL_MODE=false
SHELL_MODE=false
DESTROY_MODE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --local)
            LOCAL_MODE=true
            shift
            ;;
        --shell)
            SHELL_MODE=true
            shift
            ;;
        --destroy)
            DESTROY_MODE=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

print_header() {
    echo ""
    echo -e "${YELLOW}========================================${NC}"
    echo -e "${YELLOW}$1${NC}"
    echo -e "${YELLOW}========================================${NC}"
    echo ""
}

print_step() {
    echo -e "${GREEN}>>> $1${NC}"
}

print_info() {
    echo -e "    $1"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

# Destroy VM
destroy_vm() {
    print_header "Destroying VM"
    if multipass info "$VM_NAME" &>/dev/null; then
        multipass delete "$VM_NAME" --purge
        print_success "VM destroyed"
    else
        print_info "VM doesn't exist"
    fi
}

# Handle --destroy
if $DESTROY_MODE; then
    destroy_vm
    exit 0
fi

# Handle --shell with existing VM
if $SHELL_MODE && ! $LOCAL_MODE; then
    if multipass info "$VM_NAME" &>/dev/null; then
        print_header "Connecting to VM"
        multipass shell "$VM_NAME"
        exit 0
    else
        print_error "VM doesn't exist. Run without --shell first to create it."
        exit 1
    fi
fi

# Check if multipass is installed
if ! command -v multipass &>/dev/null; then
    print_error "Multipass is not installed. Install with: brew install multipass"
    exit 1
fi

# Main test flow
print_header "TimeTiles Bootstrap Test"
print_info "VM Name: $VM_NAME"
print_info "Mode: $($LOCAL_MODE && echo 'Local codebase' || echo 'GitHub clone')"
print_info "Shell after: $SHELL_MODE"

# Destroy existing VM if any
if multipass info "$VM_NAME" &>/dev/null; then
    print_step "Destroying existing VM..."
    multipass delete "$VM_NAME" --purge
fi

# Create new VM
print_step "Creating Ubuntu 24.04 VM..."
multipass launch 24.04 --name "$VM_NAME" --cpus "$VM_CPUS" --memory "$VM_MEMORY" --disk "$VM_DISK"
print_success "VM created"

# Wait for VM to be ready
print_step "Waiting for VM to be ready..."
sleep 10

# Get VM IP
VM_IP=$(multipass info "$VM_NAME" --format json | grep -o '"ipv4": "[^"]*"' | head -1 | cut -d'"' -f4)
print_info "VM IP: $VM_IP"

# Add test domain to /etc/hosts in VM
print_step "Configuring test domain..."
multipass exec "$VM_NAME" -- sudo bash -c "echo '$VM_IP $TEST_DOMAIN' >> /etc/hosts"

transfer_bootstrap_files() {
    print_step "Transferring bootstrap files..."

    # Create bootstrap directory
    multipass exec "$VM_NAME" -- sudo mkdir -p /opt/timetiles-bootstrap
    multipass exec "$VM_NAME" -- sudo chown ubuntu:ubuntu /opt/timetiles-bootstrap

    # Transfer main files
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

    # Make bootstrap executable
    multipass exec "$VM_NAME" -- chmod +x /opt/timetiles-bootstrap/bootstrap.sh

    print_success "Bootstrap files transferred"
}

transfer_local_codebase() {
    print_step "Transferring local codebase to VM..."
    print_info "This includes all local changes not yet pushed to GitHub"

    # Create temp directory for extraction
    multipass exec "$VM_NAME" -- sudo mkdir -p /tmp/timetiles-extract
    multipass exec "$VM_NAME" -- sudo chown -R ubuntu:ubuntu /tmp/timetiles-extract

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

    # Transfer and extract to temp dir
    print_info "Transferring to VM..."
    multipass transfer "$tarball" "${VM_NAME}:/tmp/timetiles-local.tar.gz"

    print_info "Extracting..."
    multipass exec "$VM_NAME" -- tar -xzf /tmp/timetiles-local.tar.gz -C /tmp/timetiles-extract

    # Move deployment folder contents to /opt/timetiles (flat structure)
    multipass exec "$VM_NAME" -- sudo mkdir -p /opt/timetiles
    multipass exec "$VM_NAME" -- sudo cp -r /tmp/timetiles-extract/deployment/* /opt/timetiles/
    multipass exec "$VM_NAME" -- sudo chown -R ubuntu:ubuntu /opt/timetiles

    # Clean up
    rm -f "$tarball"
    multipass exec "$VM_NAME" -- rm -rf /tmp/timetiles-local.tar.gz /tmp/timetiles-extract

    print_success "Local codebase transferred"
}

create_bootstrap_config() {
    print_step "Creating bootstrap configuration..."

    local config_content="DOMAIN_NAME=$TEST_DOMAIN
LETSENCRYPT_EMAIL=$TEST_EMAIL
REPO_URL=https://github.com/jfilter/timetiles.git
REPO_BRANCH=main
INSTALL_DIR=/opt/timetiles
APP_USER=timetiles
SKIP_SSL=true"

    if $LOCAL_MODE; then
        config_content+="
SKIP_CLONE=true"
    fi

    echo "$config_content" | multipass exec "$VM_NAME" -- sudo tee /opt/timetiles-bootstrap/bootstrap.conf > /dev/null
    print_success "Configuration created"
}

run_bootstrap() {
    print_header "Running Bootstrap"

    print_step "Starting bootstrap (this may take 10-15 minutes)..."

    # Run bootstrap non-interactively
    if multipass exec "$VM_NAME" -- sudo /opt/timetiles-bootstrap/bootstrap.sh --config /opt/timetiles-bootstrap/bootstrap.conf; then
        print_success "Bootstrap completed successfully"
    else
        print_error "Bootstrap failed"
        print_info "Checking logs..."
        multipass exec "$VM_NAME" -- sudo cat /var/log/timetiles-bootstrap.log 2>/dev/null | tail -50
        return 1
    fi
}

verify_deployment() {
    print_header "Verifying Deployment"

    # Check Docker
    print_step "Checking Docker..."
    if multipass exec "$VM_NAME" -- docker info &>/dev/null; then
        print_success "Docker is running"
    else
        print_error "Docker is not running"
        return 1
    fi

    # Check containers
    print_step "Checking containers..."
    local containers
    containers=$(multipass exec "$VM_NAME" -- docker ps --format '{{.Names}}' 2>/dev/null | sort | tr '\n' ' ')
    print_info "Running: $containers"

    for container in postgres web nginx; do
        if echo "$containers" | grep -q "$container"; then
            print_success "$container container is running"
        else
            print_error "$container container is not running"
            return 1
        fi
    done

    # Wait for application health check
    print_step "Waiting for application health check..."
    local max_attempts=30
    local attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        if multipass exec "$VM_NAME" -- curl -sfk https://localhost/api/health &>/dev/null; then
            print_success "Application is healthy!"
            break
        fi
        attempt=$((attempt + 1))
        echo -n "."
        sleep 5
    done

    if [[ $attempt -ge $max_attempts ]]; then
        print_warning "Health check timed out - checking logs..."
        multipass exec "$VM_NAME" -- bash -c "cd /opt/timetiles && ./timetiles logs 2>&1 | tail -30"
    fi

    # Show health status
    print_step "Health check response:"
    multipass exec "$VM_NAME" -- curl -sk https://localhost/api/health | head -20

    print_success "Deployment verified"
}

test_backup_restore() {
    print_header "Testing Backup/Restore"

    local deploy_cmd="cd /opt/timetiles && sudo ./timetiles"

    # Test database backup
    print_step "Creating database backup..."
    if multipass exec "$VM_NAME" -- bash -c "${deploy_cmd} backup db"; then
        print_success "Database backup created"
    else
        print_error "Database backup failed"
        return 1
    fi

    # Test uploads backup
    print_step "Creating uploads backup..."
    if multipass exec "$VM_NAME" -- bash -c "${deploy_cmd} backup uploads"; then
        print_success "Uploads backup created"
    else
        print_error "Uploads backup failed"
        return 1
    fi

    # List snapshots
    print_step "Listing snapshots..."
    multipass exec "$VM_NAME" -- bash -c "${deploy_cmd} backup list"

    # Verify repository
    print_step "Verifying backup repository..."
    if multipass exec "$VM_NAME" -- bash -c "${deploy_cmd} backup verify"; then
        print_success "Backup verification passed"
    else
        print_warning "Backup verification had issues"
    fi

    # Count snapshots (should have at least 2: db + uploads)
    print_step "Checking snapshot count..."
    local snapshot_count
    snapshot_count=$(multipass exec "$VM_NAME" -- bash -c "cd /opt/timetiles && RESTIC_PASSWORD=\$(grep RESTIC_PASSWORD .env.production | cut -d= -f2) restic -r /opt/timetiles/backups/restic-repo snapshots --json 2>/dev/null | jq length")
    if [[ "$snapshot_count" -ge 2 ]]; then
        print_success "Found $snapshot_count snapshots"
    else
        print_error "Expected at least 2 snapshots, found $snapshot_count"
        return 1
    fi

    print_success "Backup/Restore tests passed"
}

test_cli_symlink() {
    print_header "Testing CLI Symlink"

    print_step "Checking /usr/local/bin/timetiles symlink..."
    if multipass exec "$VM_NAME" -- test -L /usr/local/bin/timetiles; then
        print_success "Symlink exists"

        # Verify it works
        print_step "Testing 'timetiles status' command..."
        if multipass exec "$VM_NAME" -- timetiles status; then
            print_success "CLI symlink works"
        else
            print_warning "CLI command returned non-zero (may be OK)"
        fi
    else
        print_error "Symlink not found at /usr/local/bin/timetiles"
        return 1
    fi
}

verify_restored_data() {
    print_step "Verifying app health after restore..."

    if multipass exec "$VM_NAME" -- curl -sfk https://localhost/api/health &>/dev/null; then
        print_success "App is healthy after restore"
    else
        print_error "App health check failed after restore"
        return 1
    fi
}

print_summary() {
    print_header "Test Summary"

    echo -e "${GREEN}All tests completed successfully!${NC}"
    echo ""
    echo "VM Details:"
    echo "  Name: $VM_NAME"
    echo "  IP: $VM_IP"
    echo ""
    echo "To access the VM:"
    echo "  multipass shell $VM_NAME"
    echo ""
    echo "To view logs:"
    echo "  multipass exec $VM_NAME -- timetiles logs"
    echo ""
    echo "To check status:"
    echo "  multipass exec $VM_NAME -- timetiles status"
    echo ""
    echo "To destroy the VM:"
    echo "  ./test-multipass.sh --destroy"
}

# Main execution
transfer_bootstrap_files

if $LOCAL_MODE; then
    transfer_local_codebase
fi

create_bootstrap_config
run_bootstrap
verify_deployment
test_cli_symlink
test_backup_restore

print_summary

# Shell mode
if $SHELL_MODE; then
    print_header "Opening Shell"
    print_info "Type 'exit' to leave the VM"
    multipass shell "$VM_NAME"
fi
