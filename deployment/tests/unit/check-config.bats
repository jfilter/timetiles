#!/usr/bin/env bats
# `timetiles check` reports unconfigured required variables instead of stopping.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    TEST_TEMP_DIR=$(cd "$TEST_TEMP_DIR" && pwd -P)
    mkdir -p "$TEST_TEMP_DIR/deployment" "$TEST_TEMP_DIR/bin"
    install_cli "$TEST_TEMP_DIR/deployment"
    export TEST_CLI="$TEST_TEMP_DIR/deployment/timetiles"
    printf '#!/bin/bash\nexit 0\n' > "$TEST_TEMP_DIR/bin/docker"
    chmod +x "$TEST_TEMP_DIR/bin/docker"
    PATH="$TEST_TEMP_DIR/bin:$PATH"
}

teardown() {
    teardown_temp_dir
}

@test "check names a required variable missing from .env.production" {
    printf 'DB_PASSWORD=test\nDOMAIN_NAME=test.local\n' > "$TEST_TEMP_DIR/deployment/.env.production"
    run "$TEST_CLI" check
    assert_contains "$output" "Missing/unconfigured vars: PAYLOAD_SECRET"
}
