#!/usr/bin/env bats
# Bootstrap step 13's install_runner, with docker and chown stubbed on PATH.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir

    INSTALL="$TEST_TEMP_DIR/opt"
    RUNNER="$INSTALL/scraper-runner"
    mkdir -p "$RUNNER/dist" "$RUNNER/node_modules/old-dep"
    echo old > "$RUNNER/dist/index.js"
    echo old > "$RUNNER/package.json"

    export IMAGE_ROOT="$TEST_TEMP_DIR/image"
    mkdir -p "$IMAGE_ROOT/app/dist" "$IMAGE_ROOT/app/node_modules/new-dep"
    echo new > "$IMAGE_ROOT/app/dist/index.js"
    echo new > "$IMAGE_ROOT/app/package.json"

    mkdir -p "$TEST_TEMP_DIR/bin"
    cat > "$TEST_TEMP_DIR/bin/docker" <<'STUB'
#!/bin/bash
case "$1" in
    pull) [[ -z "${PULL_FAILS:-}" ]] || { echo "fixture: registry denied" >&2; exit 1; } ;;
    export) if [[ -n "${EXPORT_BROKEN:-}" ]]; then echo "not a tar stream"; else tar -C "$IMAGE_ROOT" -cf - app; fi ;;
esac
STUB
    printf '#!/bin/bash\n' > "$TEST_TEMP_DIR/bin/chown"
    chmod +x "$TEST_TEMP_DIR/bin/"*
    PATH="$TEST_TEMP_DIR/bin:$PATH"
}

# die signals the top-level shell, so the step runs in its own bash, not in bats' shell.
install() {
    run bash -c 'source "$1/lib/common.sh"; source "$1/steps/13-scraper-setup.sh"; install_runner "$2" timetiles 1.2.3' \
        _ "$BOOTSTRAP_DIR" "$INSTALL"
}

teardown() {
    teardown_temp_dir
}

@test "a failed extraction keeps the installed runner" {
    export EXPORT_BROKEN=1
    install

    [ "$status" -ne 0 ]
    [ "$(cat "$RUNNER/dist/index.js")" = "old" ]
    [ "$(cat "$RUNNER/package.json")" = "old" ]
    [ -d "$RUNNER/node_modules/old-dep" ]
    [ -z "$(find "$RUNNER" -maxdepth 1 -name '.staging.*')" ]
}

@test "a failed pull shows the registry error" {
    export PULL_FAILS=1
    install

    [ "$status" -ne 0 ]
    assert_contains "$output" "fixture: registry denied"
    [ "$(cat "$RUNNER/dist/index.js")" = "old" ]
}

@test "a successful install replaces the runner" {
    install

    [ "$status" -eq 0 ]
    [ "$(cat "$RUNNER/dist/index.js")" = "new" ]
    [ ! -e "$RUNNER/node_modules/old-dep" ]
}
