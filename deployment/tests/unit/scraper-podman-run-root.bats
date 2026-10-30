#!/usr/bin/env bats
# Step 13's ensure_podman_run_root, with sudo, podman, pkill and systemctl stubbed on PATH.

bats_require_minimum_version 1.5.0

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    STEP13="$BOOTSTRAP_DIR/steps/13-scraper-setup.sh"
    BIN="$TEST_TEMP_DIR/bin"
    mkdir -p "$BIN"
    printf '#!/bin/sh\necho 1000\n' > "$BIN/id"
    # Drops "-u <user>" and runs the rest, so podman_as reaches the podman stub.
    printf '#!/bin/sh\nshift 2\nexec "$@"\n' > "$BIN/sudo"
    for cmd in systemctl pkill; do
        printf '#!/bin/sh\necho "%s $*" >> "%s/calls"\n' "$cmd" "$TEST_TEMP_DIR" > "$BIN/$cmd"
    done
    # Answers `info` with the recorded run root; `system reset` records RESET_TO.
    cat > "$BIN/podman" << EOF
#!/bin/sh
echo "podman \$*" >> "$TEST_TEMP_DIR/calls"
case "\$1" in
    info) cat "$TEST_TEMP_DIR/run_root" ;;
    system) echo "\$RESET_TO" > "$TEST_TEMP_DIR/run_root" ;;
esac
EOF
    chmod +x "$BIN"/*
    touch "$TEST_TEMP_DIR/calls"
}

teardown() {
    teardown_temp_dir
}

ensure_run_root() {
    run env PATH="$BIN:$PATH" RESET_TO="${1}" bash -c \
        'source "$1/lib/common.sh"; source "$2"; ensure_podman_run_root timetiles' _ "$BOOTSTRAP_DIR" "$STEP13"
}

@test "a store on the runtime dir's run root is left alone" {
    echo /run/user/1000/containers > "$TEST_TEMP_DIR/run_root"
    ensure_run_root unused
    [ "$status" -eq 0 ]
    run ! grep -q 'system reset' "$TEST_TEMP_DIR/calls"
}

@test "the pause process is stopped before podman is first asked" {
    echo /run/user/1000/containers > "$TEST_TEMP_DIR/run_root"
    ensure_run_root unused
    [ "$status" -eq 0 ]
    pkill_line=$(grep -n '^pkill -u timetiles -x catatonit$' "$TEST_TEMP_DIR/calls" | cut -d: -f1)
    info_line=$(grep -n '^podman info' "$TEST_TEMP_DIR/calls" | head -1 | cut -d: -f1)
    [ -n "$pkill_line" ] && [ -n "$info_line" ]
    [ "$pkill_line" -lt "$info_line" ]
}

@test "a store pinned to the /tmp run root is reset" {
    echo /tmp/containers-user-1000/containers > "$TEST_TEMP_DIR/run_root"
    ensure_run_root /run/user/1000/containers
    [ "$status" -eq 0 ]
    grep -qx 'podman system reset --force' "$TEST_TEMP_DIR/calls"
}

@test "a reset that leaves the wrong run root fails the step" {
    echo /tmp/containers-user-1000/containers > "$TEST_TEMP_DIR/run_root"
    ensure_run_root /tmp/containers-user-1000/containers
    [ "$status" -ne 0 ]
    [[ "$output" == *"still records run root /tmp/containers-user-1000/containers"* ]]
}
