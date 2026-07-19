#!/usr/bin/env bats
# Unit tests for bootstrap/steps/05-clone-repo.sh
#
# Regression coverage for the install-dir layout contract: $INSTALL_DIR must be
# a symlink into ${INSTALL_DIR}-src/deployment. Between 20c85a51 (2026-04-30)
# and this suite, step 04 created $INSTALL_DIR as a real directory via
# `useradd --create-home`, so ensure_symlink died on every fresh bootstrap and
# nothing caught it.

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

# This is the regression that broke fresh installs for three months: anything
# that materializes $INSTALL_DIR as a real directory before step 05 (useradd
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

@test "ensure_install_dirs creates backups inside the symlinked install dir" {
    skip_if_not_root

    ensure_symlink "$INSTALL_DIR" "$SRC_DIR"
    ensure_install_dirs "$INSTALL_DIR" "root"

    # Resolves through the symlink into the real working tree
    assert_dir_exists "$SRC_DIR/deployment/backups"
}
