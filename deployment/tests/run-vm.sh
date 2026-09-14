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

VM_NAME="timetiles-test"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Wall-clock ceiling for a single run_in_vm command. Bootstrap with a local
# monorepo image build is the long pole.
VM_CMD_TIMEOUT="${VM_CMD_TIMEOUT:-5400}"

source "$SCRIPT_DIR/helpers/colors.sh"
source "$SCRIPT_DIR/helpers/lima.sh"

# Lima mounts a directory at the same path inside the guest, so the host
# checkout appears here read-only. Everything the VM installs from is a copy
# rsynced out of it into GUEST_SRC.
GUEST_MOUNT="$PROJECT_ROOT"
GUEST_SRC="/opt/timetiles-src"
GUEST_DEPLOY="$GUEST_SRC/deployment"

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
        # Land in the deployment dir when there is one. On a VM that has been
        # created but never run, nothing has been synced yet and cd would fail.
        shell_workdir="/"
        if vm_sudo "test -d $GUEST_DEPLOY" 2>/dev/null; then
            shell_workdir="$GUEST_DEPLOY"
        fi
        limactl shell --workdir "$shell_workdir" "$VM_NAME"
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
    lima_detached limactl create -y --name="$VM_NAME" --mount "$PROJECT_ROOT" "$SCRIPT_DIR/lima.yaml"
fi

vm_start

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
    # A local image name and pull_policy: never are what actually make this
    # local. Without them the build is tagged with the same GHCR reference the
    # base file names, and `up` is free to replace it with the pulled image --
    # so the VM silently tested the published build instead of the working
    # tree, and `docker compose ps` could not show the difference because it
    # prints the tag, not the image ID. docker-compose.override.yml.example
    # has always set a local tag for exactly this reason; the harness did not.
    #
    # Every app service needs it: they only share an image name, there is no
    # inheritance from web, so naming the tag once is not enough. A service
    # added here later and forgotten silently falls back to the registry.
    vm_sudo "cat > $GUEST_DEPLOY/docker-compose.override.yml <<'OVERRIDE'
services:
  web:
    image: timetiles-vm:local
    pull_policy: never
    build:
      context: $GUEST_SRC
      dockerfile: deployment/Dockerfile.prod
      network: host
  worker-ingest:
    image: timetiles-vm:local
    pull_policy: never
  worker-general:
    image: timetiles-vm:local
    pull_policy: never
  worker-maintenance:
    image: timetiles-vm:local
    pull_policy: never
OVERRIDE"
else
    print_info "Configuring GHCR pull mode..."
    vm_sudo "rm -f $GUEST_DEPLOY/docker-compose.override.yml"
fi

# The scraper runner is installed by bootstrap step 13, which has its own source
# for the binary and does not look at the compose override above. Left alone it
# always pulls from GHCR, so --local tested published runner code against
# working-tree deployment code -- and a packaging bug in the runner's Dockerfile
# survived a full green run because the image under test predated the fix.
# Written into the config after the sync, since --delete would remove it.
vm_sudo "sed -i '/^SCRAPER_LOCAL_BUILD=/d' $GUEST_DEPLOY/tests/bootstrap.test.conf
    echo 'SCRAPER_LOCAL_BUILD=\"$LOCAL_BUILD\"' >> $GUEST_DEPLOY/tests/bootstrap.test.conf"

# Run bootstrap. It creates the /opt/timetiles -> $GUEST_DEPLOY symlink itself;
# nothing here may pre-create that path as a real directory.
print_header "Bootstrap"
run_in_vm "Running bootstrap" \
    "$GUEST_DEPLOY/bootstrap/bootstrap.sh --non-interactive --config $GUEST_DEPLOY/tests/bootstrap.test.conf"

# Hand the deployment to the test runner in a torn-down state.
print_info "Post-bootstrap setup..."
vm_sudo "
    chown -R timetiles:timetiles $GUEST_SRC 2>/dev/null || true

    # Undo what that sweep just broke. The web and worker images run as uid
    # 1001, and step 07 deliberately hands them the log and upload dirs; the
    # recursive chown above takes both back for the app user, so every
    # container restarted for the test phase dies on its first log write with
    # EACCES. That failure is silent in the harness output and surfaces much
    # later as an unrelated-looking API error, because Payload's onInit seed
    # dies with it -- which is exactly how it was found.
    chown -R 1001:1001 $GUEST_DEPLOY/logs $GUEST_DEPLOY/uploads $GUEST_DEPLOY/exports 2>/dev/null || true

    cd /opt/timetiles
    docker compose -f docker-compose.prod.yml --env-file .env.production down -v 2>/dev/null || true
"
echo -e "${GREEN}✓ Post-bootstrap setup${NC}"

# Run tests. sg docker is needed because the docker group membership granted by
# bootstrap does not apply to an existing session.
print_header "Running Tests"

# Explicitly reset only the VM's disposable deployment. The integration runner
# requires its services to be running and does not provision or reset them.
TEST_EXIT=0
if ! limactl shell -y --workdir / "$VM_NAME" \
    sudo -u timetiles sg docker -c "cd /opt/timetiles/tests && DEPLOYMENT_TEST_DISPOSABLE=1 ./helpers/setup-test-env.sh && BOOTSTRAP_EXPECTED=1 ./run-all.sh"; then
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
