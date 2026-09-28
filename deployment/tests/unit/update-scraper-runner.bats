#!/usr/bin/env bats
# `timetiles update` runner replacement, with docker, sudo, id, chown, curl and sleep stubbed on PATH.

stub() {
    printf '#!/bin/bash\n%s\n' "$2" > "$STUB_BIN/$1"
    chmod +x "$STUB_BIN/$1"
}

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    TEST_TEMP_DIR=$(cd "$TEST_TEMP_DIR" && pwd -P)

    local deploy="$TEST_TEMP_DIR/deployment"
    install_cli "$deploy"
    printf 'SCRAPER_RUNNER_URL=http://host.docker.internal:4000\nTIMETILES_VERSION=1.2.3\n' > "$deploy/.env.production"

    RUNNER="$deploy/scraper-runner"
    mkdir -p "$RUNNER/dist" "$RUNNER/node_modules/old-dep"
    echo old > "$RUNNER/dist/index.js"
    echo old > "$RUNNER/package.json"

    export IMAGE_ROOT="$TEST_TEMP_DIR/image"
    mkdir -p "$IMAGE_ROOT/app/dist" "$IMAGE_ROOT/app/node_modules/new-dep"
    echo new > "$IMAGE_ROOT/app/dist/index.js"
    echo new > "$IMAGE_ROOT/app/package.json"

    STUB_BIN="$TEST_TEMP_DIR/bin"
    mkdir -p "$STUB_BIN"
    export CALLS="$TEST_TEMP_DIR/calls.log"
    : > "$CALLS"
    stub docker 'echo "docker $*" >> "$CALLS"
case "$1" in
    pull) [[ "${PULL_RC:-0}" -eq 0 ]] || echo "fixture: registry denied" >&2; exit "${PULL_RC:-0}" ;;
    export) if [[ -n "${EXPORT_BROKEN:-}" ]]; then echo "not a tar stream"; else tar -C "$IMAGE_ROOT" -cf - app; fi ;;
    build) exit 1 ;;
esac'
    stub sudo 'echo "sudo $*" >> "$CALLS"'
    stub chown ':'
    stub id 'case "$*" in "-un") echo operator ;; *) echo 1000 ;; esac'
    stub sleep ':'
    stub curl 'echo "curl $*" >> "$CALLS"; exit "${HEALTH_RC:-0}"'
    PATH="$STUB_BIN:$PATH"

    _source_bootstrap_file "$deploy/timetiles"
}

teardown() {
    teardown_temp_dir
}

assert_old_runner_intact() {
    [ "$(cat "$RUNNER/dist/index.js")" = "old" ]
    [ "$(cat "$RUNNER/package.json")" = "old" ]
    assert_dir_exists "$RUNNER/node_modules/old-dep"
    [ -z "$(find "$RUNNER" -maxdepth 1 -name '.staging.*')" ]
}

@test "a failed image pull leaves the installed runner untouched" {
    PULL_RC=1 run update_scraper_runner

    [ "$status" -ne 0 ]
    assert_old_runner_intact
    assert_not_contains "$(cat "$CALLS")" "systemctl restart"
    assert_contains "$output" "fixture: registry denied"
}

@test "a failed extraction leaves the installed runner untouched" {
    EXPORT_BROKEN=1 run update_scraper_runner

    [ "$status" -ne 0 ]
    assert_old_runner_intact
    assert_not_contains "$(cat "$CALLS")" "systemctl restart"
}

@test "a successful update swaps in the new runner and restarts it" {
    run update_scraper_runner

    [ "$status" -eq 0 ]
    [ "$(cat "$RUNNER/dist/index.js")" = "new" ]
    [ "$(cat "$RUNNER/package.json")" = "new" ]
    assert_dir_exists "$RUNNER/node_modules/new-dep"
    [ ! -e "$RUNNER/node_modules/old-dep" ]
    [ -z "$(find "$RUNNER" -maxdepth 1 -name '.staging.*')" ]
    assert_contains "$(cat "$CALLS")" "systemctl restart timescrape-runner.service"
    assert_contains "$(cat "$CALLS")" "http://localhost:4000/health"
}

@test "a runner that never becomes healthy after the restart fails the update" {
    HEALTH_RC=22 run update_scraper_runner

    [ "$status" -eq 1 ]
    assert_contains "$output" "not healthy"
}

@test "a failing alert script is reported, not fatal" {
    printf '#!/bin/bash\nexit 3\n' > "$STUB_BIN/alert"
    chmod +x "$STUB_BIN/alert"

    ALERT_SCRIPT="$STUB_BIN/alert" run send_alert "Backup Failed" "details"

    [ "$status" -eq 0 ]
    assert_contains "$output" "alert 'Backup Failed' not sent"
}

@test "deploy_files_ref reads a quoted version" {
    printf "TIMETILES_VERSION='1.2.3'\n" > "$ENV_FILE"
    [ "$(deploy_files_ref)" = "v1.2.3" ]
}
