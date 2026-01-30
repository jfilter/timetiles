#!/bin/bash
# TimeTiles Deployment Test Runner (Vagrant/VirtualBox)
# Runs the full test suite inside an Ubuntu VM for production-like testing
#
# Usage:
#   ./run-vm.sh              # Run tests (reuses existing VM)
#   ./run-vm.sh --fresh      # Destroy and recreate VM from scratch
#   ./run-vm.sh --shell      # Shell into existing VM
#   ./run-vm.sh --destroy    # Destroy test VM
#
# Requirements:
#   - Vagrant: brew install --cask vagrant
#   - VirtualBox 7.1+: https://www.virtualbox.org/wiki/Downloads
#   - Add VBoxManage to PATH or it will be auto-detected

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse arguments
FRESH_MODE=false
SHELL_MODE=false
DESTROY_MODE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --fresh) FRESH_MODE=true; shift ;;
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

# Setup PATH for Vagrant and VirtualBox
setup_path() {
    # Add Vagrant to PATH if needed
    if ! command -v vagrant &>/dev/null && [[ -x /opt/vagrant/bin/vagrant ]]; then
        export PATH="/opt/vagrant/bin:$PATH"
    fi

    # Add VBoxManage to PATH if needed
    if ! command -v VBoxManage &>/dev/null; then
        if [[ -x "/Applications/VirtualBox.app/Contents/MacOS/VBoxManage" ]]; then
            export PATH="/Applications/VirtualBox.app/Contents/MacOS:$PATH"
        fi
    fi
}

setup_path

# Handle --destroy
if $DESTROY_MODE; then
    print_header "Destroying VM"
    vagrant destroy -f 2>/dev/null || true
    echo -e "${GREEN}✓ VM destroyed${NC}"
    exit 0
fi

# Handle --shell
if $SHELL_MODE; then
    if vagrant status 2>/dev/null | grep -q "running"; then
        print_header "Connecting to VM"
        vagrant ssh
        exit 0
    else
        echo -e "${RED}Error: VM not running. Run without --shell first.${NC}"
        exit 1
    fi
fi

# Check vagrant installed
if ! command -v vagrant &>/dev/null; then
    echo -e "${RED}Error: Vagrant not installed${NC}"
    echo "Install with: brew install --cask vagrant"
    exit 1
fi

# Check VirtualBox installed
if ! command -v VBoxManage &>/dev/null; then
    echo -e "${RED}Error: VirtualBox not installed or VBoxManage not in PATH${NC}"
    echo "Install VirtualBox 7.1+ from: https://www.virtualbox.org/wiki/Downloads"
    exit 1
fi

# Main test flow
print_header "TimeTiles Deployment Tests (Vagrant)"
echo "Mode: $(if $FRESH_MODE; then echo 'fresh (recreate VM)'; else echo 'reuse existing VM'; fi)"
echo ""

# Check VM status
VM_RUNNING=false
if vagrant status 2>/dev/null | grep -q "running"; then
    VM_RUNNING=true
fi

# Handle fresh mode
if $FRESH_MODE && $VM_RUNNING; then
    print_step "Destroying existing VM (--fresh)..."
    vagrant destroy -f
    VM_RUNNING=false
fi

if ! $VM_RUNNING; then
    print_step "Starting VM (first run downloads ~1GB image)..."
    vagrant up --provider=virtualbox
    echo -e "${GREEN}✓ VM ready${NC}"
else
    echo -e "${GREEN}✓ Reusing existing VM${NC}"
    print_step "Syncing codebase..."
    vagrant rsync
    # Rsync creates files as vagrant:vagrant — fix ownership for timetiles user
    vagrant ssh -c "sudo chown -R timetiles:timetiles /opt/timetiles" 2>/dev/null
fi

# Run tests
print_header "Running Tests"

TEST_EXIT=0
if ! vagrant ssh -c "sudo -u timetiles sg docker -c 'cd /opt/timetiles/tests && ./run-all.sh'"; then
    TEST_EXIT=1
fi

# Results
print_header "Results"
if [[ $TEST_EXIT -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
else
    echo -e "${RED}Some tests failed${NC}"
fi

echo ""
echo "VM kept for reuse. Commands:"
echo "  Shell:   ./run-vm.sh --shell"
echo "  Rerun:   ./run-vm.sh"
echo "  Fresh:   ./run-vm.sh --fresh"
echo "  Destroy: ./run-vm.sh --destroy"

exit $TEST_EXIT
