#!/usr/bin/env bash
# Podman-specific test utilities for BATS integration tests
#
# Every Podman call here is bounded by a timeout on purpose. The fault these
# tests exist for is a *hang*, not an error: rootless Podman blocks
# indefinitely when systemd-logind stops answering DBus, and an unbounded
# check would hang the suite rather than report the fault.

# Load common helpers first
load '../helpers/common.bash'

# Generous enough for a cold container start, short enough that a wedged
# Podman is reported rather than waited out.
PODMAN_TIMEOUT="${PODMAN_TIMEOUT:-60}"

# Initialize the rootless environment (call in setup)
init_podman() {
    # Rootless Podman needs its per-user runtime dir. The suite runs under
    # `sudo -u timetiles`, which does not set XDG_RUNTIME_DIR itself, and
    # without it Podman falls back to a different location than the one
    # bootstrap and the runner service use.
    export XDG_RUNTIME_DIR="${XDG_RUNTIME_DIR:-/run/user/$(id -u)}"
}

# Run podman with a bounded timeout. Exit status 124 means it hung.
podman_bounded() {
    timeout "$PODMAN_TIMEOUT" podman "$@"
}

# Skip when the scraper feature was never installed (SKIP_SCRAPER=true).
skip_if_no_podman() {
    if ! command -v podman &>/dev/null; then
        skip "Podman is not installed (scraper setup disabled)"
    fi
}

# Skip when the scraper was never deployed on this host.
#
# The suite also runs in CI on a bare runner that never went through bootstrap:
# Podman is installed there, but no sandbox network and no runner unit exist, so
# checks for them would fail for a reason that says nothing about the code.
#
# The unit file is the discriminator. Bootstrap step 13 installs it, so its
# absence means the feature was never set up -- while a unit that exists but is
# not active is a genuine fault and must still fail.
skip_if_no_scraper_deployment() {
    if ! systemctl cat timescrape-runner.service &>/dev/null; then
        skip "Scraper runner not deployed on this host"
    fi
}

# Require an image, distinguishing "absent" from "Podman is wedged".
#
# Skipping on a timeout would hide exactly the fault these tests were written
# for, so a timeout fails loudly and only a genuine absence skips.
require_scraper_image() {
    local image="$1"
    local rc=0

    podman_bounded image exists "$image" || rc=$?

    case $rc in
        0) return 0 ;;
        124)
            echo "Podman timed out checking for $image -- wedged?" >&2
            return 1
            ;;
        *) skip "Scraper image $image not present" ;;
    esac
}
