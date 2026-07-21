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
    # The same runtime dir bootstrap and the runner unit use, so these tests
    # inspect the store production actually has. Set unconditionally rather than
    # with a :- default: an inherited value would quietly point the suite at a
    # different store, where an image the runner holds reads as absent.
    export XDG_RUNTIME_DIR="/run/user/$(id -u)"
}

# Strip podman's warning banner from captured output, WITHOUT losing podman's
# exit status.
#
# BATS's `run` merges stderr into $output, and podman prefixes its result with
# whatever warnings it felt like emitting -- "The cgroupv2 manager is set to
# systemd but there is no systemd user session available" and its three
# companions, for one. A test comparing $output to "true" then fails while the
# actual value is correct, which is a test bug reported as a product bug.
#
# The filtering used to be a pipeline (`podman_bounded … | grep … | tail -1`).
# BATS runs tests without `pipefail`, so $status was always `tail`'s -- i.e.
# always 0 -- and every `[ "$status" -ne 124 ]` canary in this suite was dead
# code that could not fail. Since the timeout canary is the entire reason this
# file exists (see the header), that defeated the point of the helper.
#
# So: run podman first, keep its status in a variable, and only then filter.
# 2>&1 is part of the contract -- the banner goes to stderr, and if it is not
# captured and filtered here it escapes into the $output that `run` assembles,
# which is exactly the mess this helper was added to prevent.
podman_value() {
    local raw
    local status=0

    raw=$(podman_bounded "$@" 2>&1) || status=$?

    printf '%s\n' "$raw" | grep -vE '^time=".*" level=(warning|info)' | tail -1

    return "$status"
}

# Run podman with a bounded timeout. Exit status 124 means it hung.
#
# stdin comes from /dev/null, and that redirect is load-bearing. Podman starts
# long-lived helper daemons -- aardvark-dns the moment a container joins a
# DNS-enabled network -- and those daemons inherit the file descriptors of the
# CLI that spawned them. Under BATS, stdin is a pipe the runner reads to decide
# when the suite is done, so the daemon ends up holding that pipe's write end
# open after every test has finished. BATS then waits for an EOF that cannot
# arrive and the whole run hangs indefinitely: observed once as a 52-minute
# stall with all tests already reported and no process left doing any work.
#
# The timeout above does not save us here, because nothing has timed out --
# podman exited cleanly long ago and only its orphaned daemon still holds the
# descriptor.
podman_bounded() {
    timeout "$PODMAN_TIMEOUT" podman "$@" </dev/null
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
