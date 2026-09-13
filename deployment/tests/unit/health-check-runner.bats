#!/usr/bin/env bats
# Scraper runner probe of scripts/health-check.sh, with systemctl and curl stubbed on PATH.

stub() {
    printf '#!/bin/bash\n%s\n' "$2" > "$STUB_BIN/$1"
    chmod +x "$STUB_BIN/$1"
}

setup() {
    load '../helpers/common.bash'
    setup_temp_dir

    STUB_BIN="$TEST_TEMP_DIR/bin"
    mkdir -p "$STUB_BIN" "$TEST_TEMP_DIR/state"
    export CALLS="$TEST_TEMP_DIR/calls.log"
    : > "$CALLS"
    stub systemctl 'echo "systemctl $*" >> "$CALLS"
case "$1" in
    is-enabled) exit "${ENABLED_RC:-1}" ;;
    is-active) exit "${ACTIVE_RC:-3}" ;;
esac'
    stub curl 'echo "curl $*" >> "$CALLS"; exit "${CURL_RC:-7}"'
    stub logger ':'
    PATH="$STUB_BIN:$PATH"

    source "$DEPLOY_DIR/scripts/health-check.sh"
    export SCRAPER_FAILURE_COUNT_FILE="$TEST_TEMP_DIR/state/.scraper-health-failures"
    export SCRAPER_COOLDOWN_FILE="$TEST_TEMP_DIR/state/.scraper-last-restart"
    export SCRAPER_UNIT_FILE="$TEST_TEMP_DIR/timescrape-runner.service"
    export ALERT_SCRIPT="$TEST_TEMP_DIR/no-alert.sh"
}

teardown() {
    teardown_temp_dir
}

@test "a host without the runner unit is healthy and never probed" {
    ENABLED_RC=1 run check_scraper

    [ "$status" -eq 0 ]
    assert_not_contains "$(cat "$CALLS")" "curl"
}

@test "an enabled runner that is not active fails the check" {
    ENABLED_RC=0 ACTIVE_RC=3 run check_scraper

    [ "$status" -eq 1 ]
    assert_contains "$(cat "$CALLS")" "http://localhost:4000/health"
}

@test "a runner unit file that is not enabled still fails the check" {
    touch "$SCRAPER_UNIT_FILE"

    ENABLED_RC=1 run check_scraper

    [ "$status" -eq 1 ]
    assert_contains "$(cat "$CALLS")" "http://localhost:4000/health"
}

@test "an installed runner answering its health endpoint passes and resets the counter" {
    echo 2 > "$SCRAPER_FAILURE_COUNT_FILE"

    ENABLED_RC=0 CURL_RC=0 run check_scraper

    [ "$status" -eq 0 ]
    [ "$(cat "$SCRAPER_FAILURE_COUNT_FILE")" = "0" ]
}

@test "the third consecutive failure restarts the runner" {
    ENABLED_RC=0 run check_scraper
    ENABLED_RC=0 run check_scraper
    assert_not_contains "$(cat "$CALLS")" "systemctl restart"

    ENABLED_RC=0 run check_scraper

    [ "$status" -eq 1 ]
    assert_contains "$(cat "$CALLS")" "systemctl restart timescrape-runner.service"
    [ "$(cat "$SCRAPER_FAILURE_COUNT_FILE")" = "0" ]
}
