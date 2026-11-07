#!/usr/bin/env bats
# Unit tests for bootstrap/steps/05-clone-repo.sh
#
# Coverage for the install-dir layout contract: $INSTALL_DIR must be a symlink
# into ${INSTALL_DIR}-src/deployment, never a real directory created earlier.

setup() {
    load '../helpers/common.bash'
    load_lib "common"
    load_step "05-clone-repo"
    setup_temp_dir

    INSTALL_DIR="$TEST_TEMP_DIR/timetiles"
    SRC_DIR="$TEST_TEMP_DIR/timetiles-src"
    mkdir -p "$SRC_DIR/deployment"
}

teardown() {
    teardown_temp_dir
}

# Run ensure_symlink in a subshell so its `die` cannot abort the test run.
run_ensure_symlink() {
    run bash -c '
        source "$1/lib/common.sh"
        source "$1/steps/05-clone-repo.sh"
        ensure_symlink "$2" "$3"
    ' _ "$BOOTSTRAP_DIR" "$1" "$2"
}

# =============================================================================
# ensure_symlink
# =============================================================================

@test "ensure_symlink creates the link when the install dir does not exist" {
    ensure_symlink "$INSTALL_DIR" "$SRC_DIR"

    [ -L "$INSTALL_DIR" ]
}

@test "ensure_symlink points the install dir at <src>/deployment" {
    ensure_symlink "$INSTALL_DIR" "$SRC_DIR"

    [ "$(readlink "$INSTALL_DIR")" = "$SRC_DIR/deployment" ]
}

@test "ensure_symlink makes deployment files reachable through the install dir" {
    echo "marker" > "$SRC_DIR/deployment/docker-compose.prod.yml"

    ensure_symlink "$INSTALL_DIR" "$SRC_DIR"

    assert_file_exists "$INSTALL_DIR/docker-compose.prod.yml"
    [ "$(cat "$INSTALL_DIR/docker-compose.prod.yml")" = "marker" ]
}

@test "ensure_symlink retargets an existing symlink" {
    local old_src="$TEST_TEMP_DIR/timetiles-src.old"
    mkdir -p "$old_src/deployment"
    ln -sfn "$old_src/deployment" "$INSTALL_DIR"

    ensure_symlink "$INSTALL_DIR" "$SRC_DIR"

    [ "$(readlink "$INSTALL_DIR")" = "$SRC_DIR/deployment" ]
}

@test "ensure_symlink is idempotent across repeated runs" {
    ensure_symlink "$INSTALL_DIR" "$SRC_DIR"
    ensure_symlink "$INSTALL_DIR" "$SRC_DIR"

    [ -L "$INSTALL_DIR" ]
    [ "$(readlink "$INSTALL_DIR")" = "$SRC_DIR/deployment" ]
}

# Anything that materializes $INSTALL_DIR as a real directory before step 05 (useradd
# --create-home, a stray mkdir, an rsync into the install dir) is fatal.
@test "ensure_symlink refuses a pre-existing real directory" {
    mkdir -p "$INSTALL_DIR"

    run_ensure_symlink "$INSTALL_DIR" "$SRC_DIR"

    [ "$status" -ne 0 ]
    assert_contains "$output" "already exists as a regular directory"
}

@test "ensure_symlink leaves a pre-existing real directory untouched" {
    mkdir -p "$INSTALL_DIR"
    echo "operator data" > "$INSTALL_DIR/keepme"

    run_ensure_symlink "$INSTALL_DIR" "$SRC_DIR"

    [ ! -L "$INSTALL_DIR" ]
    assert_file_exists "$INSTALL_DIR/keepme"
}

# =============================================================================
# ensure_install_dirs
# =============================================================================

# ensure_dir chowns, so calling it for real would need root — and the suite runs
# as the timetiles user in the VM and as an unprivileged user on the host, so a
# root-gated test here would never actually execute anywhere. Stub ensure_dir
# and assert the contract instead: which directories get created, and how.
@test "ensure_install_dirs creates backups owned by the app user, mode 750" {
    local calls=()
    ensure_dir() { calls+=("$1|$2|$3"); }

    ensure_install_dirs "/opt/timetiles" "timetiles"

    [ "${#calls[@]}" -eq 1 ]
    [ "${calls[0]}" = "/opt/timetiles/backups|timetiles:timetiles|750" ]
}

# Anything created inside the install dir lands in a real git working tree, so
# it must be covered by deployment/.gitignore or `timetiles update` breaks.
@test "ensure_install_dirs only creates gitignored paths" {
    local calls=()
    ensure_dir() { calls+=("$1"); }

    ensure_install_dirs "/opt/timetiles" "timetiles"

    # Guard against passing vacuously if the loop below has nothing to check
    [ "${#calls[@]}" -gt 0 ]

    for call in "${calls[@]}"; do
        local relative="${call#/opt/timetiles/}"
        grep -qx "${relative}/" "$DEPLOY_DIR/.gitignore" \
            || { echo "Not gitignored in deployment/.gitignore: $relative"; return 1; }
    done
}

# =============================================================================
# sparse_checkout_patterns
# =============================================================================

@test "sparse_checkout_patterns leaves app sources out when the scraper is skipped" {
    run env SKIP_SCRAPER=true bash -c 'source "$1/steps/05-clone-repo.sh"; sparse_checkout_patterns' _ "$BOOTSTRAP_DIR"

    [ "$status" -eq 0 ]
    [ "$output" = $'deployment/\napps/web/config/' ]
}

@test "sparse_checkout_patterns includes the SDK sources the scraper images build from" {
    run env SKIP_SCRAPER=false bash -c 'source "$1/steps/05-clone-repo.sh"; sparse_checkout_patterns' _ "$BOOTSTRAP_DIR"

    [ "$status" -eq 0 ]
    [[ "$output" == *$'apps/timescrape/\n'* ]]
    [[ "$output" == *$'packages/python/\n'* ]]
    [[ "$output" == *$'packages/scraper/\n'* ]]
    [[ "$output" == *'packages/typescript-config/'* ]]
}

# =============================================================================
# preserve_operator_state / run_step re-clone
# =============================================================================

# A repo whose deployment/ carries the files step 05 verifies and ignores operator state.
make_origin() {
    local origin="$TEST_TEMP_DIR/origin"
    mkdir -p "$origin/deployment"
    touch "$origin/deployment/timetiles" "$origin/deployment/docker-compose.prod.yml" \
        "$origin/deployment/.env.production.example"
    printf '.env.production\nuploads/\n' > "$origin/deployment/.gitignore"
    git -C "$origin" init -q -b main
    git -C "$origin" add -A
    git -C "$origin" -c user.name=t -c user.email=t@example.org commit -q -m fixture
    echo "file://$origin"
}

# mv that fails for a source path ending in $FAIL_MV, otherwise the real one.
stub_failing_mv() {
    local real_mv
    real_mv="$(command -v mv)"
    mkdir -p "$TEST_TEMP_DIR/bin"
    printf '#!/bin/bash\n[[ -n "$FAIL_MV" && "$1" == *"$FAIL_MV" ]] && { echo "mv: fixture failure" >&2; exit 1; }\nexec %q "$@"\n' \
        "$real_mv" > "$TEST_TEMP_DIR/bin/mv"
    chmod +x "$TEST_TEMP_DIR/bin/mv"
}

run_clone_step() {
    run env PATH="$TEST_TEMP_DIR/bin:$PATH" REPO_URL="$1" INSTALL_DIR="$INSTALL_DIR" FAIL_MV="${FAIL_MV:-}" bash -c '
        source "$1/lib/common.sh"; source "$1/steps/05-clone-repo.sh"
        chown() { :; }; ensure_dir() { :; }
        run_step' _ "$BOOTSTRAP_DIR"
}

@test "preserve_operator_state moves state back when a later move fails" {
    stub_failing_mv
    local old="$TEST_TEMP_DIR/old" new="$TEST_TEMP_DIR/new"
    mkdir -p "$old/deployment/uploads" "$new/deployment"
    echo env > "$old/deployment/.env.production"
    echo upload > "$old/deployment/uploads/a.jpg"
    list_operator_paths() { printf '%s\n' deployment/.env.production deployment/uploads; }

    PATH="$TEST_TEMP_DIR/bin:$PATH" FAIL_MV=deployment/uploads run preserve_operator_state "$old" "$new"

    [ "$status" -eq 1 ]
    [ "$(cat "$old/deployment/.env.production")" = env ]
    [ "$(cat "$old/deployment/uploads/a.jpg")" = upload ]
    [ ! -e "$new/deployment/.env.production" ]
}

@test "a re-clone whose state move fails aborts and keeps the installed tree" {
    local origin
    origin="$(make_origin)"
    stub_failing_mv
    run_clone_step "$origin"
    [ "$status" -eq 0 ]
    echo secret > "$SRC_DIR/deployment/.env.production"
    mkdir -p "$SRC_DIR/deployment/uploads"
    echo upload > "$SRC_DIR/deployment/uploads/a.jpg"

    FAIL_MV=deployment/uploads/a.jpg run_clone_step "$origin"

    [ "$status" -ne 0 ]
    assert_contains "$output" "Could not carry operator state into the new checkout"
    [ "$(cat "$SRC_DIR/deployment/.env.production")" = secret ]
    [ "$(cat "$SRC_DIR/deployment/uploads/a.jpg")" = upload ]
    [ ! -e "$SRC_DIR.old" ]
}
