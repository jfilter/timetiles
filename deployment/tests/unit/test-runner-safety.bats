#!/usr/bin/env bats
# Exercise runner entrypoints in a disposable tree with no real Docker calls.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    REAL_BATS=$(command -v bats)
    mkdir -p "$TEST_TEMP_DIR/helpers" "$TEST_TEMP_DIR/integration" "$TEST_TEMP_DIR/bin"
    cp "$TESTS_DIR/run-integration.sh" "$TEST_TEMP_DIR/"
    cp "$TESTS_DIR/helpers/colors.sh" "$TEST_TEMP_DIR/helpers/"
    cp "$TESTS_DIR/helpers/setup-test-env.sh" "$TEST_TEMP_DIR/helpers/"
    touch "$TEST_TEMP_DIR/integration/example.bats"
    export PATH="$TEST_TEMP_DIR/bin:$PATH"
    unset DEPLOYMENT_TEST_DISPOSABLE DEPLOYMENT_EXPECTED BOOTSTRAP_EXPECTED

    cat > "$TEST_TEMP_DIR/bin/docker" << 'EOF'
#!/bin/bash
echo called > "$TEST_TEMP_DIR/docker-called"
exit "${DOCKER_STATUS:-0}"
EOF
    cat > "$TEST_TEMP_DIR/bin/bats" << 'EOF'
#!/bin/bash
echo "DEPLOYMENT_EXPECTED=${DEPLOYMENT_EXPECTED:-}"
EOF
    cat > "$TEST_TEMP_DIR/bin/timeout" << 'EOF'
#!/bin/bash
shift
exec "$@"
EOF
    chmod +x "$TEST_TEMP_DIR/bin/"*
}

teardown() {
    teardown_temp_dir
}

@test "test setup requires explicit disposable-environment consent before external calls" {
    export DOCKER_STATUS=1
    run bash "$TEST_TEMP_DIR/helpers/setup-test-env.sh"
    [ "$status" -eq 1 ]
    [[ "$output" == *"DEPLOYMENT_TEST_DISPOSABLE=1"* ]]
    [ ! -e "$TEST_TEMP_DIR/docker-called" ]
}

@test "integration runner never automatically resets the deployment" {
    cat > "$TEST_TEMP_DIR/helpers/setup-test-env.sh" << 'EOF'
#!/bin/bash
touch "$TEST_TEMP_DIR/reset-called"
EOF
    run bash "$TEST_TEMP_DIR/run-integration.sh"
    [ "$status" -eq 0 ]
    [ ! -e "$TEST_TEMP_DIR/reset-called" ]
    [[ "$output" == *"DEPLOYMENT_EXPECTED=1"* ]]
}

run_bootstrap_checks() {
    local fixture="$TEST_TEMP_DIR/bootstrap-fixture/tests"
    mkdir -p "$fixture/helpers" "$fixture/integration"
    cp "$TESTS_DIR/helpers/common.bash" "$TESTS_DIR/helpers/docker.bash" "$fixture/helpers/"
    cp "$TESTS_DIR/integration/bootstrap-output.bats" "$fixture/integration/"
    run "$REAL_BATS" "$fixture/integration/bootstrap-output.bats"
}

@test "image-only tests do not require bootstrap output" {
    export DEPLOYMENT_EXPECTED=1
    run_bootstrap_checks
    [ "$status" -eq 0 ]
    [[ "$output" == *"# skip No bootstrap"* ]]
}

@test "VM tests fail when expected bootstrap output is missing" {
    export BOOTSTRAP_EXPECTED=1
    run_bootstrap_checks
    [ "$status" -eq 1 ]
    [[ "$output" == *"Expected bootstrap's .env.production"* ]]
}
