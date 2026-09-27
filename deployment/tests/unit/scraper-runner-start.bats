#!/usr/bin/env bats
# start_runner must pick up a replaced unit file on a rerun of step 13.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    STEP13="$BOOTSTRAP_DIR/steps/13-scraper-setup.sh"
    mkdir -p "$TEST_TEMP_DIR/bin"
    for cmd in systemctl systemd-tmpfiles journalctl sleep; do
        printf '#!/bin/sh\necho "%s $*" >> "%s/calls"\n' "$cmd" "$TEST_TEMP_DIR" > "$TEST_TEMP_DIR/bin/$cmd"
        chmod +x "$TEST_TEMP_DIR/bin/$cmd"
    done
}

teardown() {
    teardown_temp_dir
}

@test "an already active runner is restarted, not left on the old unit" {
    run env PATH="$TEST_TEMP_DIR/bin:$PATH" bash -c \
        'source "$1/lib/common.sh"; source "$2"; start_runner' _ "$BOOTSTRAP_DIR" "$STEP13"
    [ "$status" -eq 0 ]
    grep -qx 'systemctl restart timescrape-runner.service' "$TEST_TEMP_DIR/calls"
}
