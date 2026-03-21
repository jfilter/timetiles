#!/bin/bash
# TimeTiles Deployment Test Runner (Vagrant/VirtualBox)
# Runs the full test suite inside an Ubuntu VM for production-like testing
#
# Usage:
#   ./run-vm.sh              # Run tests (reuses existing VM)
#   ./run-vm.sh --fresh      # Destroy and recreate VM from scratch
#   ./run-vm.sh --shell      # Shell into existing VM
#   ./run-vm.sh --destroy    # Destroy test VM
#   ./run-vm.sh --local      # Build images from source (default)
#   ./run-vm.sh --ghcr       # Pull images from GHCR
#
# Requirements:
#   - Vagrant: brew install --cask vagrant
#   - VirtualBox 7.1+: https://www.virtualbox.org/wiki/Downloads
#   - Add VBoxManage to PATH or it will be auto-detected

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

source "$SCRIPT_DIR/helpers/colors.sh"

FRESH_MODE=false
SHELL_MODE=false
DESTROY_MODE=false
export LOCAL_BUILD="${LOCAL_BUILD:-true}"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --fresh) FRESH_MODE=true; shift ;;
        --shell) SHELL_MODE=true; shift ;;
        --destroy) DESTROY_MODE=true; shift ;;
        --local) LOCAL_BUILD=true; shift ;;
        --ghcr) LOCAL_BUILD=false; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

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

# Run a command in the VM via nohup, poll for completion.
# This survives SSH disconnects during long Docker builds.
# Usage: run_in_vm "description" "command"
run_in_vm() {
    local desc="$1"
    local cmd="$2"
    local log="/tmp/timetiles-vm-cmd.log"
    local exitfile="/tmp/timetiles-vm-cmd.exit"

    print_info "$desc"

    # Start command in background inside VM, write exit code to file when done
    vagrant ssh -c "sudo bash -c '
        rm -f $exitfile
        nohup bash -c \"$cmd; echo \\\$? > $exitfile\" > $log 2>&1 &
    '" 2>/dev/null

    # Poll until exit file appears (reconnects if SSH drops)
    while true; do
        if vagrant ssh -c "test -f $exitfile" 2>/dev/null; then
            break
        fi
        # Print progress to keep user informed
        local progress
        progress=$(vagrant ssh -c "tail -1 $log 2>/dev/null" 2>/dev/null | tr -d '\r')
        if [[ -n "$progress" ]]; then
            printf "\r  %-80s" "${progress:0:80}"
        fi
        sleep 10
    done
    echo ""

    # Read exit code
    local exit_code
    exit_code=$(vagrant ssh -c "cat $exitfile 2>/dev/null" 2>/dev/null | tr -d '\r\n ')

    if [[ "$exit_code" != "0" ]]; then
        echo -e "${RED}Failed: $desc${NC}"
        vagrant ssh -c "tail -30 $log 2>/dev/null" 2>/dev/null
        return 1
    fi

    echo -e "${GREEN}✓ $desc${NC}"
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
echo "Build: $(if [[ "$LOCAL_BUILD" == "true" ]]; then echo 'local (docker compose build)'; else echo 'GHCR (docker compose pull)'; fi)"
echo ""

# Check VM status
VM_RUNNING=false
if vagrant status 2>/dev/null | grep -q "running"; then
    VM_RUNNING=true
fi

# Handle fresh mode
if $FRESH_MODE && $VM_RUNNING; then
    print_info "Destroying existing VM (--fresh)..."
    vagrant destroy -f
    VM_RUNNING=false
fi

if ! $VM_RUNNING; then
    print_info "Starting VM (first run downloads ~1GB image)..."
    vagrant up --provider=virtualbox
    echo -e "${GREEN}✓ VM ready${NC}"
else
    echo -e "${GREEN}✓ Reusing existing VM${NC}"
    print_info "Syncing codebase..."
    vagrant rsync
    vagrant ssh -c "sudo chown -R timetiles:timetiles /opt/timetiles /opt/timetiles-src && sudo chmod -R a+rX /opt/timetiles-src" 2>/dev/null
fi

# Pre-bootstrap cleanup: tear down any leftover containers from previous runs
# (rsync overwrites substituted configs with templates, so stale containers would fail)
print_info "Cleaning up previous deployment..."
vagrant ssh -c "sudo bash -c '
    cd /opt/timetiles
    if [[ -f .env.production ]]; then
        docker compose -f docker-compose.prod.yml --env-file .env.production down -v 2>/dev/null || true
    fi
    rm -f .env.production docker-compose.ssl-override.yml docker-compose.test.yml
    rm -f /var/lib/timetiles/.bootstrap-lock /var/lib/timetiles/.bootstrap-state /var/lib/timetiles/.bootstrap-config
'" 2>/dev/null
echo -e "${GREEN}✓ Cleanup done${NC}"

# Run bootstrap in the VM (via nohup to survive SSH disconnects during Docker builds)
print_header "Bootstrap"
run_in_vm "Running bootstrap" \
    "/opt/timetiles/bootstrap/bootstrap.sh --non-interactive --config /opt/timetiles/tests/bootstrap.test.conf"

# Post-bootstrap setup: fix permissions and tear down for test runner
print_info "Post-bootstrap setup..."
vagrant ssh -c "sudo bash -c '
    chown -R timetiles:timetiles /opt/timetiles
    chown -R timetiles:timetiles /opt/timetiles-src 2>/dev/null || true
    cd /opt/timetiles
    docker compose -f docker-compose.prod.yml --env-file .env.production down -v 2>/dev/null || true
'" 2>/dev/null
echo -e "${GREEN}✓ Post-bootstrap setup${NC}"

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
