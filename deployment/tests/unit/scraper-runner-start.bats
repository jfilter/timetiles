#!/usr/bin/env bats
# Step 13's runner unit and start_runner, with systemd tools stubbed on PATH.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    STEP13="$BOOTSTRAP_DIR/steps/13-scraper-setup.sh"
    mkdir -p "$TEST_TEMP_DIR/bin"
    for cmd in systemctl systemd-tmpfiles journalctl sleep; do
        printf '#!/bin/sh\necho "%s $*" >> "%s/calls"\n' "$cmd" "$TEST_TEMP_DIR" > "$TEST_TEMP_DIR/bin/$cmd"
        chmod +x "$TEST_TEMP_DIR/bin/$cmd"
    done
    printf '#!/bin/sh\necho 1000\n' > "$TEST_TEMP_DIR/bin/id"
    chmod +x "$TEST_TEMP_DIR/bin/id"
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

@test "the unit hands the runner the work directory it may write" {
    run env PATH="$TEST_TEMP_DIR/bin:$PATH" bash -c \
        'source "$1/lib/common.sh"; source "$2"; runner_unit /opt/timetiles timetiles' _ "$BOOTSTRAP_DIR" "$STEP13"
    [ "$status" -eq 0 ]
    data_dir=$(sed -n 's/^Environment=SCRAPER_DATA_DIR=//p' <<< "$output")
    [ -n "$data_dir" ]
    [[ " $(sed -n 's/^ReadWritePaths=//p' <<< "$output") " == *" $data_dir "* ]]
}
