#!/usr/bin/env bats
# Unit tests for `timetiles ingest recover`

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    TEST_TEMP_DIR=$(cd "$TEST_TEMP_DIR" && pwd -P)
    mkdir -p "$TEST_TEMP_DIR/deployment" "$TEST_TEMP_DIR/bin"
    install_cli "$TEST_TEMP_DIR/deployment"
    cat > "$TEST_TEMP_DIR/deployment/.env.production" << 'EOF2'
DB_PASSWORD=test
DOMAIN_NAME=test.local
PAYLOAD_SECRET=testsecret
EOF2
    cat > "$TEST_TEMP_DIR/bin/docker" << 'EOF2'
#!/bin/bash
[[ "$1" == "info" ]] && exit 0
printf '%s\n' "$*" >> "$TEST_TEMP_DIR/docker-calls"
EOF2
    chmod +x "$TEST_TEMP_DIR/bin/docker"
    export PATH="$TEST_TEMP_DIR/bin:$PATH"
    export TEST_TEMP_DIR
}

teardown() {
    teardown_temp_dir
}

@test "ingest recover runs the recovery script in the web container without applying" {
    run "$TEST_TEMP_DIR/deployment/timetiles" ingest recover
    [ "$status" -eq 0 ]
    [[ "$(cat "$TEST_TEMP_DIR/docker-calls")" == *" exec -T web node "*"/payload/bin.js run scripts/recover-ingests.ts" ]]
}

@test "ingest recover --apply passes apply to the recovery script" {
    run "$TEST_TEMP_DIR/deployment/timetiles" ingest recover --apply
    [ "$status" -eq 0 ]
    [[ "$(cat "$TEST_TEMP_DIR/docker-calls")" == *"run scripts/recover-ingests.ts apply" ]]
}

@test "ingest recover rejects an unknown option without calling docker" {
    run "$TEST_TEMP_DIR/deployment/timetiles" ingest recover --force
    [ "$status" -eq 1 ]
    [[ "$output" == *"Usage"* ]]
    [ ! -f "$TEST_TEMP_DIR/docker-calls" ]
}

@test "ingest without recover shows its usage" {
    run "$TEST_TEMP_DIR/deployment/timetiles" ingest
    [ "$status" -eq 1 ]
    [[ "$output" == *"ingest recover"* ]]
}
