#!/usr/bin/env bats
# `update` finishes in a fresh process after pulling, so it runs the pulled CLI
# with the pulled libraries even when called with --no-self-update.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    TEST_TEMP_DIR=$(cd "$TEST_TEMP_DIR" && pwd -P)
    mkdir -p "$TEST_TEMP_DIR/.git" "$TEST_TEMP_DIR/deployment" "$TEST_TEMP_DIR/bin"
    install_cli "$TEST_TEMP_DIR/deployment"
    export TEST_CLI="$TEST_TEMP_DIR/deployment/timetiles"
    printf 'DB_PASSWORD=test\nDOMAIN_NAME=test.local\nPAYLOAD_SECRET=testsecret\n' \
        > "$TEST_TEMP_DIR/deployment/.env.production"

    export CALLS="$TEST_TEMP_DIR/calls.log"
    : > "$CALLS"
    export PULLED_LIB="$TEST_TEMP_DIR/deployment/bootstrap/lib/common.sh"
    # The pull rewrites common.sh; a process that sources it afterwards announces itself.
    cat > "$TEST_TEMP_DIR/bin/git" << 'EOF'
#!/bin/bash
echo "git $*" >> "$CALLS"
if [[ " $* " == *" reset --hard "* ]]; then echo 'echo PULLED_LIB_LOADED >&2' >> "$PULLED_LIB"; fi
exit 0
EOF
    cat > "$TEST_TEMP_DIR/bin/docker" << 'EOF'
#!/bin/bash
echo "docker $*" >> "$CALLS"
if [[ "$1" == "inspect" ]]; then echo "DATADIR=/var/lib/postgresql/data"; fi
exit 0
EOF
    chmod +x "$TEST_TEMP_DIR/bin/git" "$TEST_TEMP_DIR/bin/docker"
    PATH="$TEST_TEMP_DIR/bin:$PATH"
    unset TIMETILES_UPDATE_PULLED
}

teardown() {
    teardown_temp_dir
}

@test "update --no-self-update continues with the pulled libraries" {
    run "$TEST_CLI" update --no-self-update
    [[ "$output" == *"PULLED_LIB_LOADED"* ]]
}

@test "update pulls the deployment files once" {
    run "$TEST_CLI" update --no-self-update
    [ "$(grep -c ' reset --hard ' "$CALLS")" -eq 1 ]
}
