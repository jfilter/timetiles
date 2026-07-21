#!/usr/bin/env bats
# Unit tests for bootstrap/install.sh argument assembly.
#
# install.sh is the documented one-liner entry point --
#   curl -sSL .../install.sh | sudo bash
# -- so its NO-ARGUMENT path is the most-travelled install route there is.
# Nothing exercised install.sh at all until this suite.
#
# Regression under test: parse_args built the array with
#   BOOTSTRAP_ARGS=("${bootstrap_args[@]:-}")
# and main expanded it again with
#   run_bootstrap "${BOOTSTRAP_ARGS[@]:-}"
# On an EMPTY array, `:-` substitutes a single empty-string element rather than
# nothing at all. bootstrap.sh was therefore invoked as `./bootstrap.sh ""`,
# fell through to the `*)` arm of its parser, and exited 1 with
# "Unknown option: ". Every default installation aborted, and so did every
# `--domain`/`--email`/`--branch` install, since those flags are consumed by
# install.sh and never appended to the array.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir

    INSTALL_SH="$BOOTSTRAP_DIR/install.sh"

    # install.sh ends with its entrypoint, `main "$@"`. Strip that single line
    # so the script can be sourced and main() driven directly, with stubs in
    # place of the steps that need root and the network.
    INSTALL_LIB="$TEST_TEMP_DIR/install-lib.sh"
    grep -vxF 'main "$@"' "$INSTALL_SH" > "$INSTALL_LIB"

    # Stand in for the cloned repo: a bootstrap.sh that records how it was
    # called instead of bootstrapping anything.
    FAKE_REPO="$TEST_TEMP_DIR/temp/repo"
    mkdir -p "$FAKE_REPO/deployment/bootstrap/steps"
    cat > "$FAKE_REPO/deployment/bootstrap/bootstrap.sh" << 'RECORDER'
#!/bin/bash
echo "argc=$#"
for arg in "$@"; do
    echo "arg=[$arg]"
done
echo "env:DOMAIN_NAME=${DOMAIN_NAME:-}"
echo "env:LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL:-}"
RECORDER
    chmod +x "$FAKE_REPO/deployment/bootstrap/bootstrap.sh"

    # run_bootstrap runs `chmod +x deployment/bootstrap/steps/*.sh`; an empty
    # directory would leave the glob unmatched and fail the run under `set -e`.
    touch "$FAKE_REPO/deployment/bootstrap/steps/01-noop.sh"
}

teardown() {
    teardown_temp_dir
}

# Drive install.sh's real main() with only check_requirements (needs root) and
# clone_bootstrap (needs the network) stubbed out, so the actual
# parse_args -> BOOTSTRAP_ARGS -> run_bootstrap chain runs exactly as it does
# in production. Arguments passed here are the one-liner's arguments.
#
# Run in a `bash -c` subshell: install.sh installs its own EXIT trap, which
# would otherwise clobber the one bats uses to record results.
run_install() {
    run bash -c '
        set -euo pipefail
        source "$1"
        TEMP_DIR="$2"
        check_requirements() { :; }
        clone_bootstrap() { :; }
        main "${@:3}"
    ' _ "$INSTALL_LIB" "$TEST_TEMP_DIR/temp" "$@"
}

# =============================================================================
# The default path: no arguments
# =============================================================================

@test "no arguments: bootstrap.sh is invoked with zero arguments" {
    run_install

    [ "$status" -eq 0 ]
    assert_contains "$output" "argc=0"
}

@test "no arguments: bootstrap.sh receives no empty-string argument" {
    run_install

    # The exact shape of the bug: a lone "" argument.
    assert_not_contains "$output" "arg=[]"
}

@test "no arguments: the documented one-liner does not abort" {
    run_install

    [ "$status" -eq 0 ]
    assert_not_contains "$output" "Unknown option"
}

# =============================================================================
# Options consumed by install.sh itself
# =============================================================================

@test "--domain and --email are consumed, not forwarded" {
    run_install --domain example.com --email admin@example.com

    [ "$status" -eq 0 ]
    assert_contains "$output" "argc=0"
    assert_not_contains "$output" "arg=[]"
}

@test "--domain and --email reach bootstrap.sh through the environment" {
    run_install --domain example.com --email admin@example.com

    assert_contains "$output" "env:DOMAIN_NAME=example.com"
    assert_contains "$output" "env:LETSENCRYPT_EMAIL=admin@example.com"
}

@test "--branch is consumed, not forwarded" {
    run_install --branch develop

    [ "$status" -eq 0 ]
    assert_contains "$output" "argc=0"
}

@test "--help prints usage without invoking bootstrap.sh" {
    run_install --help

    [ "$status" -eq 0 ]
    assert_contains "$output" "TimeTiles One-Liner Installation"
    assert_not_contains "$output" "argc="
}

# =============================================================================
# Options forwarded to bootstrap.sh
# =============================================================================

@test "unknown options are forwarded verbatim" {
    run_install --resume

    [ "$status" -eq 0 ]
    assert_contains "$output" "argc=1"
    assert_contains "$output" "arg=[--resume]"
}

@test "several forwarded options keep their count and order" {
    # Unrecognised tokens are forwarded one by one, so an option and its value
    # arrive as two separate arguments -- three in total here.
    run_install --non-interactive --config /etc/bootstrap.conf

    [ "$status" -eq 0 ]
    assert_contains "$output" "argc=3"
    assert_contains "$output" "arg=[--non-interactive]"
    assert_contains "$output" "arg=[--config]"
    assert_contains "$output" "arg=[/etc/bootstrap.conf]"
}

@test "consumed and forwarded options can be mixed" {
    run_install --domain example.com --force

    [ "$status" -eq 0 ]
    assert_contains "$output" "argc=1"
    assert_contains "$output" "arg=[--force]"
}

@test "a forwarded argument containing spaces stays one argument" {
    # Guards the quoting inside the `${array[@]+"${array[@]}"}` expansion:
    # dropping the inner quotes would split this into two arguments.
    run_install --config "/etc/my configs/bootstrap.conf"

    [ "$status" -eq 0 ]
    assert_contains "$output" "argc=2"
    assert_contains "$output" "arg=[/etc/my configs/bootstrap.conf]"
}
