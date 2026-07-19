#!/bin/bash
# TimeTiles Deployment Test Runner (Lima)
# Runs the full test suite inside an Ubuntu VM for production-like testing.
#
# This is the only place bootstrap.sh gets exercised end-to-end — apt, the
# Docker install, useradd, systemd units, podman. CI runs the bats suites
# directly on its own runner and never invokes bootstrap.
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
#   - Lima: brew install lima
#
# The VM config lives in lima.yaml next to this script.

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

source "$SCRIPT_DIR/helpers/colors.sh"

# Pin LIMA_HOME. Colima points it at ~/.colima/_lima for its own VM; inheriting
# that would create this instance inside Colima's home.
export LIMA_HOME="$HOME/.lima"

VM_NAME="timetiles-test"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Lima mounts a directory at the same path inside the guest, so the host
# checkout appears here read-only. Everything the VM installs from is a copy
# rsynced out of it into GUEST_SRC.
GUEST_MOUNT="$PROJECT_ROOT"
GUEST_SRC="/opt/timetiles-src"
GUEST_DEPLOY="$GUEST_SRC/deployment"

# Wall-clock ceiling for a single run_in_vm command. Bootstrap with a local
# monorepo image build is the long pole.
VM_CMD_TIMEOUT="${VM_CMD_TIMEOUT:-5400}"

FRESH_MODE=false
SHELL_MODE=false
DESTROY_MODE=false
LOCAL_BUILD="${LOCAL_BUILD:-true}"

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

# Run a command in the VM as root. Always pass an explicit --workdir: without
# one Lima defaults to the host's cwd, which need not exist in the guest.
vm_sudo() {
    limactl shell -y --workdir / "$VM_NAME" sudo bash -c "$1"
}

vm_running() {
    [[ "$(limactl list "$VM_NAME" --format '{{.Status}}' 2>/dev/null)" == "Running" ]]
}

vm_exists() {
    limactl list --format '{{.Name}}' 2>/dev/null | grep -qx "$VM_NAME"
}

# Run a long command in the VM via nohup, polling for completion.
#
# limactl holds a persistent SSH connection and is far less prone to the
# disconnects that forced this pattern under Vagrant, but a detached job still
# survives host sleep and gives us progress output during multi-minute builds.
#
# The payload is shipped as a file rather than interpolated through nested
# quotes — commands carry their own quoting and the inline form did not
# survive another layer of escaping.
run_in_vm() {
    local desc="$1"
    local cmd="$2"
    local log="/tmp/timetiles-vm-cmd.log"
    local exitfile="/tmp/timetiles-vm-cmd.exit"
    local script="/tmp/timetiles-vm-cmd.sh"

    print_info "$desc"

    {
        echo '#!/bin/bash'
        echo "rm -f $exitfile"
        echo "$cmd"
        echo "echo \$? > $exitfile"
    } | limactl shell -y --workdir / "$VM_NAME" sudo tee "$script" >/dev/null

    vm_sudo "nohup bash $script > $log 2>&1 &"

    local deadline=$((SECONDS + VM_CMD_TIMEOUT))
    while ! vm_sudo "test -f $exitfile" 2>/dev/null; do
        if (( SECONDS > deadline )); then
            echo ""
            echo -e "${RED}Timed out after ${VM_CMD_TIMEOUT}s: $desc${NC}"
            vm_sudo "tail -30 $log" || true
            return 1
        fi
        local progress
        progress=$(vm_sudo "tail -1 $log 2>/dev/null" 2>/dev/null | tr -d '\r')
        if [[ -n "$progress" ]]; then
            printf "\r  %-80s" "${progress:0:80}"
        fi
        sleep 10
    done
    echo ""

    # Deliberately not silenced: a transport failure here must not read as success.
    local exit_code
    exit_code=$(vm_sudo "cat $exitfile" | tr -d '\r\n ')

    if [[ "$exit_code" != "0" ]]; then
        echo -e "${RED}Failed: $desc${NC}"
        vm_sudo "tail -30 $log" || true
        return 1
    fi

    echo -e "${GREEN}✓ $desc${NC}"
}

# Handle --destroy
if $DESTROY_MODE; then
    print_header "Destroying VM"
    limactl delete -f "$VM_NAME" 2>/dev/null || true
    echo -e "${GREEN}✓ VM destroyed${NC}"
    exit 0
fi

# Handle --shell
if $SHELL_MODE; then
    if vm_running; then
        print_header "Connecting to VM"
        limactl shell --workdir "$GUEST_DEPLOY" "$VM_NAME"
        exit 0
    else
        echo -e "${RED}Error: VM not running. Run without --shell first.${NC}"
        exit 1
    fi
fi

if ! command -v limactl &>/dev/null; then
    echo -e "${RED}Error: Lima not installed${NC}"
    echo "Install with: brew install lima"
    exit 1
fi

# Main test flow
print_header "TimeTiles Deployment Tests (Lima)"
echo "Mode:  $(if $FRESH_MODE; then echo 'fresh (recreate VM)'; else echo 'reuse existing VM'; fi)"
echo "Build: $(if [[ "$LOCAL_BUILD" == "true" ]]; then echo 'local (docker compose build)'; else echo 'GHCR (docker compose pull)'; fi)"
echo ""

if $FRESH_MODE && vm_exists; then
    print_info "Destroying existing VM (--fresh)..."
    limactl delete -f "$VM_NAME"
fi

if ! vm_exists; then
    print_info "Creating VM (first run downloads ~600MB image)..."
    limactl create -y --name="$VM_NAME" --mount "$PROJECT_ROOT" "$SCRIPT_DIR/lima.yaml"
fi

if ! vm_running; then
    print_info "Starting VM..."
    limactl start -y --timeout 15m "$VM_NAME"
fi

# Let the boot settle before bootstrap starts its own apt work, otherwise
# step 01 contends with apt-daily and unattended-upgrades for the dpkg lock.
# This belongs here and not in lima.yaml's provisioning: Lima runs system
# provision scripts as part of cloud-init, so waiting from in there deadlocks.
vm_sudo "cloud-init status --wait >/dev/null 2>&1 || true"
echo -e "${GREEN}✓ VM ready${NC}"

# Tear down any previous deployment before the sync below deletes the configs
# it depends on.
print_info "Cleaning up previous deployment..."
vm_sudo "
    if command -v docker >/dev/null 2>&1 && [ -f $GUEST_DEPLOY/.env.production ]; then
        cd $GUEST_DEPLOY
        docker compose -f docker-compose.prod.yml --env-file .env.production down -v 2>/dev/null || true
    fi
    rm -f $GUEST_DEPLOY/.env.production
    rm -f $GUEST_DEPLOY/docker-compose.ssl-override.yml
    rm -f $GUEST_DEPLOY/docker-compose.test.yml
    rm -f /var/lib/timetiles/.bootstrap-lock
    rm -f /var/lib/timetiles/.bootstrap-state
    rm -f /var/lib/timetiles/.bootstrap-config
"
echo -e "${GREEN}✓ Cleanup done${NC}"

# Copy the checkout into the VM.
#
# Deliberately a copy, not a writable mount: bootstrap chowns the tree to the
# timetiles user and installs files as uid 1001, which cannot work against
# host-backed virtiofs files. It also rewrites nginx configs in place and marks
# them assume-unchanged in the surrounding git repo — on a live mount that
# would land in the real working tree.
#
# --delete gives each run a pristine tree. Excluded paths are not deleted on
# the receiver, which is what keeps .env.production, uploads/ and backups/
# alive across runs; ssl/, nginx-test/ and scraper-runner/ are not excluded and
# so get cleared, matching what the old harness removed by hand.
print_info "Syncing codebase into the VM..."
vm_sudo "
    mkdir -p $GUEST_SRC
    rsync -a --delete --no-owner --no-group \
        --exclude-from='$GUEST_MOUNT/deployment/tests/rsync-exclude.txt' \
        '$GUEST_MOUNT/' $GUEST_SRC/
"
echo -e "${GREEN}✓ Codebase synced${NC}"

# Written after the sync — it lives inside the synced tree, so --delete would
# otherwise remove it again. Written on every invocation rather than from a
# Lima provision block, which only runs per boot.
if [[ "$LOCAL_BUILD" == "true" ]]; then
    print_info "Configuring local build mode..."
    vm_sudo "cat > $GUEST_DEPLOY/docker-compose.override.yml <<'OVERRIDE'
services:
  web:
    build:
      context: $GUEST_SRC
      dockerfile: deployment/Dockerfile.prod
      network: host
OVERRIDE"
else
    print_info "Configuring GHCR pull mode..."
    vm_sudo "rm -f $GUEST_DEPLOY/docker-compose.override.yml"
fi

# Run bootstrap. It creates the /opt/timetiles -> $GUEST_DEPLOY symlink itself;
# nothing here may pre-create that path as a real directory.
print_header "Bootstrap"
run_in_vm "Running bootstrap" \
    "$GUEST_DEPLOY/bootstrap/bootstrap.sh --non-interactive --config $GUEST_DEPLOY/tests/bootstrap.test.conf"

# Hand the deployment to the test runner in a torn-down state.
print_info "Post-bootstrap setup..."
vm_sudo "
    chown -R timetiles:timetiles $GUEST_SRC 2>/dev/null || true
    cd /opt/timetiles
    docker compose -f docker-compose.prod.yml --env-file .env.production down -v 2>/dev/null || true
"
echo -e "${GREEN}✓ Post-bootstrap setup${NC}"

# Run tests. sg docker is needed because the docker group membership granted by
# bootstrap does not apply to an existing session.
print_header "Running Tests"

TEST_EXIT=0
if ! limactl shell -y --workdir / "$VM_NAME" \
    sudo -u timetiles sg docker -c "cd /opt/timetiles/tests && ./run-all.sh"; then
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
