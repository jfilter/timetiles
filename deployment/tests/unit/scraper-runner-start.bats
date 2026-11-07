#!/usr/bin/env bats
# Step 13's runner unit and start_runner, with systemd tools stubbed on PATH.

bats_require_minimum_version 1.5.0

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

@test "the unit lets rootless podman run the setuid uid/gid mappers" {
    run env PATH="$TEST_TEMP_DIR/bin:$PATH" bash -c \
        'source "$1/lib/common.sh"; source "$2"; runner_unit /opt/timetiles timetiles' _ "$BOOTSTRAP_DIR" "$STEP13"
    [ "$status" -eq 0 ]
    run ! grep -Eq '^NoNewPrivileges=(yes|true|1|on)$' <<< "$output"
}

@test "the unit hands the runner the work directory it may write" {
    run env PATH="$TEST_TEMP_DIR/bin:$PATH" bash -c \
        'source "$1/lib/common.sh"; source "$2"; runner_unit /opt/timetiles timetiles' _ "$BOOTSTRAP_DIR" "$STEP13"
    [ "$status" -eq 0 ]
    data_dir=$(sed -n 's/^Environment=SCRAPER_DATA_DIR=//p' <<< "$output")
    [ -n "$data_dir" ]
    [[ " $(sed -n 's/^ReadWritePaths=//p' <<< "$output") " == *" $data_dir "* ]]
}

@test "podman copies images inside a directory the unit may write" {
    run env PATH="$TEST_TEMP_DIR/bin:$PATH" bash -c \
        'source "$1/lib/common.sh"; source "$2"; podman_containers_conf /opt/timetiles; runner_unit /opt/timetiles timetiles' \
        _ "$BOOTSTRAP_DIR" "$STEP13"
    [ "$status" -eq 0 ]
    tmp_dir=$(sed -n 's/^image_copy_tmp_dir = "\(.*\)"$/\1/p' <<< "$output")
    [ -n "$tmp_dir" ]
    read -ra writable <<< "$(sed -n 's/^ReadWritePaths=//p' <<< "$output")"
    covered=false
    for path in "${writable[@]}"; do
        [[ "$tmp_dir" == "$path"/* ]] && covered=true
    done
    [ "$covered" = true ]
}

@test "the runner unit needs the capped run area under its data dir" {
    run env PATH="$TEST_TEMP_DIR/bin:$PATH" bash -c \
        'source "$1/lib/common.sh"; source "$2"; runner_unit /opt/timetiles timetiles; runs_mount_unit timetiles' \
        _ "$BOOTSTRAP_DIR" "$STEP13"
    [ "$status" -eq 0 ]
    data_dir=$(sed -n 's/^Environment=SCRAPER_DATA_DIR=//p' <<< "$output")
    [ "$(sed -n 's/^Where=//p' <<< "$output")" = "$data_dir/runs" ]
    grep -qx 'Requires=tmp-timescrape-runs.mount' <<< "$output"
    grep -qx 'After=tmp-timescrape-runs.mount' <<< "$output"
}

@test "the run area is a size-capped tmpfs owned by the app user" {
    run env PATH="$TEST_TEMP_DIR/bin:$PATH" bash -c \
        'source "$1/lib/common.sh"; source "$2"; runs_mount_unit timetiles; echo "UNIT=$SCRAPER_RUNS_MOUNT_UNIT"' \
        _ "$BOOTSTRAP_DIR" "$STEP13"
    [ "$status" -eq 0 ]
    where=$(sed -n 's/^Where=//p' <<< "$output")
    [ "$where" = /tmp/timescrape/runs ]
    [ "$(sed -n 's/^Type=//p' <<< "$output")" = tmpfs ]
    [[ ",$(sed -n 's/^Options=//p' <<< "$output")," =~ ,size=[0-9]+[KMG]?, ]]
    [[ "$(sed -n 's/^Options=//p' <<< "$output")" == *",uid=1000,gid=1000,"* ]]
    # systemd only accepts a mount unit named after its escaped Where= path.
    escaped="${where#/}"
    [ "$(sed -n 's/^UNIT=//p' <<< "$output")" = "${escaped//\//-}.mount" ]
}
