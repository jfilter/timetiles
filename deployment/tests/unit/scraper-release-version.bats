#!/usr/bin/env bats
# Bootstrap step 13 installs the runner of the release the app is deployed with.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    INSTALL="$TEST_TEMP_DIR/opt"
    mkdir -p "$INSTALL"
    unset TIMETILES_VERSION
}

teardown() {
    teardown_temp_dir
}

version() {
    run bash -c 'source "$1/lib/common.sh"; source "$1/steps/13-scraper-setup.sh"; release_version "$2"' \
        _ "$BOOTSTRAP_DIR" "$INSTALL"
}

@test "the env file wins over a stale bootstrap config" {
    echo 'TIMETILES_VERSION=2.0.0' > "$INSTALL/.env.production"
    export TIMETILES_VERSION=1.0.0
    version
    [ "$status" -eq 0 ]
    [ "$output" = "2.0.0" ]
}

@test "without an env file the bootstrap config applies" {
    export TIMETILES_VERSION=1.0.0
    version
    [ "$status" -eq 0 ]
    [ "$output" = "1.0.0" ]
}

@test "an empty env value does not produce an empty image tag" {
    echo 'TIMETILES_VERSION=' > "$INSTALL/.env.production"
    export TIMETILES_VERSION=1.0.0
    version
    [ "$output" = "1.0.0" ]
}

@test "with neither source it falls back to latest" {
    version
    [ "$status" -eq 0 ]
    [ "$output" = "latest" ]
}
