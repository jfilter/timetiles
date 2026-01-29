#!/bin/bash
# TimeTiles Deployment Test Runner (Multipass VM)
# Runs the full test suite inside an Ubuntu VM for production-like testing
#
# Usage:
#   ./run-vm.sh              # Run all tests in VM
#   ./run-vm.sh --keep       # Keep VM after tests
#   ./run-vm.sh --shell      # Shell into existing VM
#   ./run-vm.sh --destroy    # Destroy test VM

set -eo pipefail

# Configuration
VM_NAME="timetiles-test"
VM_CPUS=2
VM_MEMORY="4G"
VM_DISK="20G"

# Script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse arguments
KEEP_VM=false
SHELL_MODE=false
DESTROY_MODE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --keep) KEEP_VM=true; shift ;;
        --shell) SHELL_MODE=true; shift ;;
        --destroy) DESTROY_MODE=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

print_header() {
    echo ""
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  $1${NC}"
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo ""
}

print_step() {
    echo -e "${GREEN}▶${NC} $1"
}

# Handle --destroy
if $DESTROY_MODE; then
    print_header "Destroying VM"
    multipass delete "$VM_NAME" --purge 2>/dev/null || true
    echo -e "${GREEN}✓ VM destroyed${NC}"
    exit 0
fi

# Handle --shell with existing VM
if $SHELL_MODE; then
    if multipass info "$VM_NAME" &>/dev/null; then
        print_header "Connecting to VM"
        multipass shell "$VM_NAME"
        exit 0
    else
        echo -e "${RED}Error: VM doesn't exist. Run without --shell first.${NC}"
        exit 1
    fi
fi

# Check multipass installed
if ! command -v multipass &>/dev/null; then
    echo -e "${RED}Error: Multipass not installed${NC}"
    echo "Install with: brew install multipass"
    exit 1
fi

# Main test flow
print_header "TimeTiles Deployment Tests (VM)"
echo "VM: $VM_NAME"
echo "Keep after tests: $KEEP_VM"
echo ""

# Destroy existing VM
if multipass info "$VM_NAME" &>/dev/null; then
    print_step "Destroying existing VM..."
    multipass delete "$VM_NAME" --purge
fi

# Create VM
print_step "Creating Ubuntu 24.04 VM..."
multipass launch 24.04 --name "$VM_NAME" --cpus "$VM_CPUS" --memory "$VM_MEMORY" --disk "$VM_DISK"
echo -e "${GREEN}✓ VM created${NC}"

# Wait for VM
print_step "Waiting for VM to be ready..."
sleep 10

# Get VM IP
VM_IP=$(multipass info "$VM_NAME" --format json | grep -o '"ipv4": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "VM IP: $VM_IP"

# Transfer codebase
print_header "Transferring Codebase"
print_step "Creating tarball..."
COPYFILE_DISABLE=1 tar --exclude='node_modules' --exclude='.git' --exclude='.next' \
    --exclude='dist' --exclude='.turbo' --exclude='coverage' \
    --exclude='.worktrees' --exclude='*.log' \
    -czf /tmp/timetiles-test.tar.gz -C "$PROJECT_ROOT" . 2>/dev/null

SIZE=$(du -h /tmp/timetiles-test.tar.gz | cut -f1)
echo "Tarball size: $SIZE"

print_step "Transferring to VM..."
multipass transfer /tmp/timetiles-test.tar.gz "${VM_NAME}:/tmp/"

print_step "Extracting..."
multipass exec "$VM_NAME" -- mkdir -p /home/ubuntu/timetiles
multipass exec "$VM_NAME" -- tar -xzf /tmp/timetiles-test.tar.gz -C /home/ubuntu/timetiles

rm /tmp/timetiles-test.tar.gz
echo -e "${GREEN}✓ Codebase transferred${NC}"

# Install dependencies
print_header "Installing Dependencies"
print_step "Installing Docker and BATS..."
multipass exec "$VM_NAME" -- sudo apt-get update -qq
multipass exec "$VM_NAME" -- sudo apt-get install -y -qq docker.io docker-compose-v2 bats
multipass exec "$VM_NAME" -- sudo usermod -aG docker ubuntu
multipass exec "$VM_NAME" -- sudo systemctl enable docker
multipass exec "$VM_NAME" -- sudo systemctl start docker
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Run tests
print_header "Running Tests"

# Use sg to get docker group access in same session
TEST_EXIT=0
if ! multipass exec "$VM_NAME" -- sg docker -c "cd /home/ubuntu/timetiles/deployment/tests && ./run-all.sh"; then
    TEST_EXIT=1
fi

# Results
print_header "Results"
if [[ $TEST_EXIT -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
else
    echo -e "${RED}Some tests failed${NC}"
fi

# Cleanup or keep
if ! $KEEP_VM; then
    print_step "Cleaning up VM..."
    multipass delete "$VM_NAME" --purge
    echo -e "${GREEN}✓ VM destroyed${NC}"
else
    echo ""
    echo "VM kept for debugging:"
    echo "  Shell: ./run-vm.sh --shell"
    echo "  Destroy: ./run-vm.sh --destroy"
fi

exit $TEST_EXIT
