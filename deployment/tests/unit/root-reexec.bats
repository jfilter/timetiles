#!/usr/bin/env bats
# Unit tests for the CLI handing a root invocation over to the deploy user

setup() {
    load '../helpers/common.bash'
    setup_temp_dir
    cp "$DEPLOY_DIR/timetiles" "$TEST_TEMP_DIR/timetiles"
    mkdir -p "$TEST_TEMP_DIR/bin"
    cat > "$TEST_TEMP_DIR/bin/id" << 'EOF2'
#!/bin/bash
[[ "${1:-}" == "-u" ]] && echo 0
exit 0
EOF2
    # sg runs its -c command; sudo reports the environment the CLI would get.
    cat > "$TEST_TEMP_DIR/bin/sg" << 'EOF2'
#!/bin/bash
bash -c "$3"
EOF2
    cat > "$TEST_TEMP_DIR/bin/sudo" << EOF2
#!/bin/bash
[[ "\$1" == --preserve-env=* ]] && keep="\${1#--preserve-env=}"
echo "\${keep:+\$keep=\${!keep:-}}" > "$TEST_TEMP_DIR/sudo-env"
EOF2
    chmod +x "$TEST_TEMP_DIR/bin/"*
    export PATH="$TEST_TEMP_DIR/bin:$PATH"
}

teardown() {
    teardown_temp_dir
}

@test "root re-exec keeps the container-database discard flag across sudo" {
    TIMETILES_DISCARD_CONTAINER_DB=1 run "$TEST_TEMP_DIR/timetiles" update
    [ "$status" -eq 0 ]
    grep -qx "TIMETILES_DISCARD_CONTAINER_DB=1" "$TEST_TEMP_DIR/sudo-env"
}

@test "root re-exec passes no discard flag when none is set" {
    unset TIMETILES_DISCARD_CONTAINER_DB
    run "$TEST_TEMP_DIR/timetiles" update
    [ "$status" -eq 0 ]
    ! grep -q "=1" "$TEST_TEMP_DIR/sudo-env"
}
