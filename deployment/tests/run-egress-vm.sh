#!/bin/bash
# Scraper Egress Test Runner (Lima)
# Proves the scraper sandbox's egress fence with real connections in a small
# Ubuntu VM, provisioned by the real step 03/04/13 functions.
#
# Separate from run-vm.sh because it needs no Docker, no images and no
# bootstrap run — only the firewall and rootless Podman.
#
# Usage:
#   ./run-egress-vm.sh             # Provision (reuses VM) and run the tests
#   ./run-egress-vm.sh --reboot    # Reboot, then test WITHOUT re-provisioning
#   ./run-egress-vm.sh --shell     # Shell into the VM
#   ./run-egress-vm.sh --destroy   # Destroy the VM

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

VM_NAME="timetiles-egress"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VM_CMD_TIMEOUT="${VM_CMD_TIMEOUT:-1800}"

source "$SCRIPT_DIR/helpers/colors.sh"
source "$SCRIPT_DIR/helpers/lima.sh"

# The checkout is mounted read-only at the same path in the guest. Nothing here
# writes to it, so the tests run straight from the mount.
GUEST_DEPLOY="$PROJECT_ROOT/deployment"

# A few megabytes, and the only image this VM pulls.
PROBE_IMAGE="docker.io/library/alpine:3.20"

MODE="test"
case "${1:-}" in
    "") ;;
    --reboot) MODE=reboot ;;
    --shell) MODE=shell ;;
    --destroy) MODE=destroy ;;
    *) echo "Unknown option: $1"; exit 1 ;;
esac

if [[ "$MODE" == "destroy" ]]; then
    print_header "Destroying VM"
    limactl delete -f "$VM_NAME" 2>/dev/null || true
    echo -e "${GREEN}✓ VM destroyed${NC}"
    exit 0
fi

if [[ "$MODE" == "shell" ]]; then
    limactl shell --workdir / "$VM_NAME"
    exit 0
fi

print_header "Scraper Egress Tests (Lima)"

if ! vm_exists; then
    print_info "Creating VM..."
    # lima.yaml is sized for image builds; this VM only needs Podman and ufw.
    lima_detached limactl create -y --name="$VM_NAME" --cpus 2 --memory 3 --disk 12 \
        --mount "$PROJECT_ROOT" "$SCRIPT_DIR/lima.yaml"
fi

if [[ "$MODE" == "reboot" ]]; then
    print_info "Rebooting VM..."
    limactl stop "$VM_NAME"
fi

vm_start

if [[ "$MODE" == "test" ]]; then
    # Step 04 needs the docker group to exist; the install dir and empty env
    # file stand in for steps 05 and 06. A subshell, so common.sh's EXIT trap
    # cannot end run_in_vm's wrapper before it records the exit code.
    run_in_vm "Provisioning firewall, app user and scraper sandbox" "(
        set -Eeuo pipefail
        export DEBIAN_FRONTEND=noninteractive
        source $GUEST_DEPLOY/bootstrap/lib/common.sh
        groupadd -f docker
        source $GUEST_DEPLOY/bootstrap/steps/03-firewall.sh
        run_step
        source $GUEST_DEPLOY/bootstrap/steps/04-app-user.sh
        run_step
        install -d -o timetiles -g timetiles /opt/timetiles
        touch /opt/timetiles/.env.production
        source $GUEST_DEPLOY/bootstrap/steps/13-scraper-setup.sh
        install_dir=/opt/timetiles
        install_podman
        configure_rootless timetiles
        create_sandbox_network timetiles
        allow_runner_ingress /opt/timetiles
        podman_as timetiles 600 pull $PROBE_IMAGE
    )"
fi

print_header "Running Tests"
TEST_EXIT=0
run_in_vm "Egress tests" \
    "cd $GUEST_DEPLOY/tests && PROBE_IMAGE=$PROBE_IMAGE timeout 900 bats vm/scraper-egress.bats </dev/null" \
    || TEST_EXIT=1
vm_sudo "cat /tmp/timetiles-vm-cmd.log"

print_header "Results"
if [[ $TEST_EXIT -eq 0 ]]; then
    echo -e "${GREEN}All egress tests passed!${NC}"
else
    echo -e "${RED}Some egress tests failed${NC}"
fi
echo ""
echo "VM kept for reuse. Reboot check: ./run-egress-vm.sh --reboot   Destroy: ./run-egress-vm.sh --destroy"

exit $TEST_EXIT
