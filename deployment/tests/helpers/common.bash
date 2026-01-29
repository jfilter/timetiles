#!/usr/bin/env bash
# Common test utilities for BATS tests

# Project paths
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$(cd "$TESTS_DIR/.." && pwd)"
BOOTSTRAP_DIR="$DEPLOY_DIR/bootstrap"
PROJECT_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"

# Source a bootstrap library for testing
# Usage: load_lib "common" or load_lib "state"
load_lib() {
    local lib_name="$1"
    local lib_path="$BOOTSTRAP_DIR/lib/${lib_name}.sh"

    if [[ -f "$lib_path" ]]; then
        # Disable traps from common.sh during testing
        trap - EXIT INT TERM 2>/dev/null || true
        source "$lib_path"
        trap - EXIT INT TERM 2>/dev/null || true
    else
        echo "Library not found: $lib_path" >&2
        return 1
    fi
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
