#!/usr/bin/env bats
# Commands that recreate or remove the postgres container refuse to run while the
# cluster lives in the container layer instead of the postgres_data volume.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    TEST_TEMP_DIR=$(cd "$TEST_TEMP_DIR" && pwd -P)
    mkdir -p "$TEST_TEMP_DIR/deployment" "$TEST_TEMP_DIR/bin"
    cp "$DEPLOY_DIR/timetiles" "$TEST_TEMP_DIR/deployment/timetiles"
    export TEST_CLI="$TEST_TEMP_DIR/deployment/timetiles"
    printf 'DB_PASSWORD=test\nDOMAIN_NAME=test.local\nPAYLOAD_SECRET=testsecret\n' \
        > "$TEST_TEMP_DIR/deployment/.env.production"

    # An existing postgres container whose environment is $PG_ENV; POSTGRES_ABSENT hides it.
    export CALLS="$TEST_TEMP_DIR/calls.log"
    : > "$CALLS"
    cat > "$TEST_TEMP_DIR/bin/docker" << 'EOF'
#!/bin/bash
echo "docker $*" >> "$CALLS"
if [[ " $* " == *" ps -aq postgres "* ]]; then [[ -z "${POSTGRES_ABSENT:-}" ]] && echo abc123; exit 0; fi
if [[ "$1" == "inspect" ]]; then printf '%b\n' "$PG_ENV"; exit 0; fi
exit 0
EOF
    chmod +x "$TEST_TEMP_DIR/bin/docker"
    PATH="$TEST_TEMP_DIR/bin:$PATH"
    unset TIMETILES_DISCARD_CONTAINER_DB POSTGRES_ABSENT
    export PG_ENV="POSTGRES_DBNAME=timetiles\\nPATH=/usr/bin"
}

teardown() {
    teardown_temp_dir
}

@test "down refuses when the postgres container predates DATADIR" {
    run "$TEST_CLI" down
    [ "$status" -eq 1 ]
    [[ "$output" == *"not in the postgres_data volume"* ]]
    ! grep -q " down " "$CALLS"
}

@test "down runs when postgres writes into the volume via DATADIR" {
    export PG_ENV="DATADIR=/var/lib/postgresql/data\\nPATH=/usr/bin"
    run "$TEST_CLI" down
    [ "$status" -eq 0 ]
    grep -q " down --remove-orphans" "$CALLS"
}

@test "TIMETILES_DISCARD_CONTAINER_DB=1 lets down remove the container anyway" {
    export TIMETILES_DISCARD_CONTAINER_DB=1
    run "$TEST_CLI" down
    [ "$status" -eq 0 ]
    grep -q " down --remove-orphans" "$CALLS"
}

@test "update refuses before touching images when the postgres container predates DATADIR" {
    run "$TEST_CLI" update --no-self-update
    [ "$status" -eq 1 ]
    ! grep -qE " (pull|up) " "$CALLS"
}

@test "the official image's PGDATA counts as volume-backed" {
    export PG_ENV="PGDATA=/var/lib/postgresql/data\\nPATH=/usr/bin"
    run "$TEST_CLI" down
    [ "$status" -eq 0 ]
}

@test "down runs on a fresh install without a postgres container" {
    export POSTGRES_ABSENT=1
    run "$TEST_CLI" down
    [ "$status" -eq 0 ]
}
