#!/usr/bin/env bats
# Unit tests for create-admin input handling

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    mkdir -p "$TEST_TEMP_DIR/deployment"
    install_cli "$TEST_TEMP_DIR/deployment"
    cat > "$TEST_TEMP_DIR/deployment/.env.production" << 'EOF2'
DB_PASSWORD=test
DOMAIN_NAME=test.local
PAYLOAD_SECRET=testsecret
EOF2
    unset TIMETILES_ADMIN_PASSWORD
}

teardown() {
    teardown_temp_dir
}

@test "create-admin without a terminal or password env fails with a message" {
    run "$TEST_TEMP_DIR/deployment/timetiles" create-admin admin@example.org < /dev/null
    [ "$status" -eq 1 ]
    [[ "$output" == *"TIMETILES_ADMIN_PASSWORD"* ]]
}
