#!/usr/bin/env bats
# `timetiles update` proves the web app is healthy before reporting success or touching the scraper runner.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    TEST_TEMP_DIR=$(cd "$TEST_TEMP_DIR" && pwd -P)
    mkdir -p "$TEST_TEMP_DIR/.git" "$TEST_TEMP_DIR/deployment" "$TEST_TEMP_DIR/bin"
    install_cli "$TEST_TEMP_DIR/deployment"
    export TEST_CLI="$TEST_TEMP_DIR/deployment/timetiles"
    printf 'DOMAIN_NAME=test.local\nSCRAPER_RUNNER_URL=http://host.docker.internal:4000\n' \
        > "$TEST_TEMP_DIR/deployment/.env.production"

    export CALLS="$TEST_TEMP_DIR/calls.log"
    : > "$CALLS"
    local cmd
    for cmd in git sudo systemctl sleep; do
        printf '#!/bin/sh\necho "%s $*" >> "$CALLS"\n' "$cmd" > "$TEST_TEMP_DIR/bin/$cmd"
    done
    cat > "$TEST_TEMP_DIR/bin/docker" << 'EOF'
#!/bin/sh
echo "docker $*" >> "$CALLS"
if [ "$1" = "inspect" ]; then echo "DATADIR=/var/lib/postgresql/data"; fi
exit 0
EOF
    cat > "$TEST_TEMP_DIR/bin/curl" << 'EOF'
#!/bin/sh
echo "curl $*" >> "$CALLS"
exit "${HEALTH_RC:-0}"
EOF
    chmod +x "$TEST_TEMP_DIR/bin/"*
    PATH="$TEST_TEMP_DIR/bin:$PATH"
    export TIMETILES_UPDATE_PULLED=1
}

teardown() {
    teardown_temp_dir
}

@test "an update whose web app never becomes healthy fails with the way back" {
    HEALTH_RC=22 run "$TEST_CLI" update --no-self-update

    [ "$status" -ne 0 ]
    assert_contains "$output" "web app is not healthy"
    assert_contains "$output" "Roll back: set TIMETILES_VERSION"
    assert_not_contains "$output" "Services updated!"
    grep -q 'curl .*http://localhost/api/health' "$CALLS"
    # Neither the scraper runner nor the old images are touched once the web release failed.
    assert_not_contains "$(cat "$CALLS")" "systemctl"
    assert_not_contains "$(cat "$CALLS")" "image prune"
}

@test "an update whose web app answers healthy reports success" {
    run "$TEST_CLI" update --no-self-update

    [ "$status" -eq 0 ]
    assert_contains "$output" "Services updated!"
    grep -q 'curl .*http://localhost/api/health' "$CALLS"
}
