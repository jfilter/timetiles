#!/usr/bin/env bash
# Common test utilities for BATS tests

# Project paths
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$(cd "$TESTS_DIR/.." && pwd)"
BOOTSTRAP_DIR="$DEPLOY_DIR/bootstrap"
PROJECT_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"

# Source a bootstrap file with its traps neutralized.
#
# bootstrap/lib/common.sh installs `trap trap_handler EXIT` at source time,
# which clobbers the EXIT trap bats uses to record test results. Clearing it
# outright is not enough — that leaves bats with no handler at all, so `skip`
# (which unwinds via exit) aborts the run without reporting anything. Save
# bats' traps, source, then put them back.
_source_bootstrap_file() {
    local path="$1"
    local saved_exit saved_int saved_term

    saved_exit="$(trap -p EXIT)"
    saved_int="$(trap -p INT)"
    saved_term="$(trap -p TERM)"

    source "$path"

    trap - EXIT INT TERM 2>/dev/null || true
    eval "${saved_exit:-}"
    eval "${saved_int:-}"
    eval "${saved_term:-}"
}

# Source a bootstrap library for testing
# Usage: load_lib "common" or load_lib "state"
load_lib() {
    local lib_name="$1"
    local lib_path="$BOOTSTRAP_DIR/lib/${lib_name}.sh"

    if [[ ! -f "$lib_path" ]]; then
        echo "Library not found: $lib_path" >&2
        return 1
    fi

    _source_bootstrap_file "$lib_path"
}

# Source a bootstrap step for testing (steps define functions plus run_step;
# sourcing one does not execute it)
# Usage: load_step "05-clone-repo"
load_step() {
    local step_name="$1"
    local step_path="$BOOTSTRAP_DIR/steps/${step_name}.sh"

    if [[ ! -f "$step_path" ]]; then
        echo "Step not found: $step_path" >&2
        return 1
    fi

    _source_bootstrap_file "$step_path"
}

# Assert string contains substring
# Usage: assert_contains "$output" "expected text"
assert_contains() {
    local haystack="$1"
    local needle="$2"
    if [[ "$haystack" != *"$needle"* ]]; then
        echo "Expected output to contain: $needle"
        echo "Actual output: $haystack"
        return 1
    fi
}

# Assert string does not contain substring
assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    if [[ "$haystack" == *"$needle"* ]]; then
        echo "Expected output NOT to contain: $needle"
        echo "Actual output: $haystack"
        return 1
    fi
}

# Assert file exists
assert_file_exists() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        echo "Expected file to exist: $file"
        return 1
    fi
}

# Assert directory exists
assert_dir_exists() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        echo "Expected directory to exist: $dir"
        return 1
    fi
}

# Create temp directory for test (cleaned up in teardown)
# Sets TEST_TEMP_DIR variable
setup_temp_dir() {
    TEST_TEMP_DIR=$(mktemp -d)
    export TEST_TEMP_DIR
}

# Clean up temp directory
teardown_temp_dir() {
    if [[ -d "${TEST_TEMP_DIR:-}" ]]; then
        rm -rf "$TEST_TEMP_DIR"
    fi
}

# Skip test if not running as root (for tests that need root)
skip_if_not_root() {
    if [[ $EUID -ne 0 ]]; then
        skip "Test requires root"
    fi
}

# Skip test if command not available
skip_if_no_command() {
    local cmd="$1"
    if ! command -v "$cmd" &>/dev/null; then
        skip "Command not available: $cmd"
    fi
}
