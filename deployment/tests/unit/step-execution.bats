#!/usr/bin/env bats
# Unit tests for bootstrap.sh's step execution contract.
#
# Regression under test: steps used to be run as
#   if run_step; then mark_completed "$step"
# Calling a function in an `if` condition disables errexit for that function's
# ENTIRE body, so only the step's LAST command decided the outcome. Every
# run_step in steps/ ends on a print_success, so a step whose internal command
# failed was still recorded as completed — the bootstrap carried on over it and
# `--resume` skipped it on the next run.
#
# The second half of this suite is just as important as the first: the 13 step
# scripts contain ~14 places that deliberately tolerate a non-zero command
# (`|| true`, `if ! check_memory`, `cmd || fallback`). Those must keep working,
# or arming errexit would trade one bug for a dozen.

setup() {
    load '../helpers/common.bash'
    setup_temp_dir

    # bootstrap.sh resolves its libraries via SCRIPT_DIR, so give the stripped
    # copy a directory with lib/ alongside it. `main "$@"` is dropped so the
    # file can be sourced without running a real bootstrap.
    BS_DIR="$TEST_TEMP_DIR/bs"
    mkdir -p "$BS_DIR"
    ln -s "$BOOTSTRAP_DIR/lib" "$BS_DIR/lib"
    BOOTSTRAP_LIB="$BS_DIR/bootstrap-lib.sh"
    grep -vxF 'main "$@"' "$BOOTSTRAP_DIR/bootstrap.sh" > "$BOOTSTRAP_LIB"
}

teardown() {
    teardown_temp_dir
}

# Drive the real execute_step against a synthetic run_step, with state writes
# stubbed out. Runs in a subshell because bootstrap.sh installs its own traps.
run_execute_step() {
    run bash -c '
        source "$1"
        mark_completed() { echo "MARKED:$1"; }
        eval "$2"
        execute_step "test-step"
    ' _ "$BOOTSTRAP_LIB" "$1"
}

# =============================================================================
# A step that fails must not be recorded as completed
# =============================================================================

@test "a step failing on its last command is not marked completed" {
    run_execute_step 'run_step() { false; }'

    [ "$status" -ne 0 ]
    assert_not_contains "$output" "MARKED"
}

@test "a step failing internally is not marked completed" {
    # The exact shape of the bug: the failure is mid-body and the final command
    # succeeds, so the function as a whole used to return 0.
    run_execute_step 'run_step() { false; print_success "misleading success"; }'

    [ "$status" -ne 0 ]
    assert_not_contains "$output" "MARKED"
}

@test "a step failing internally does not print its own success message" {
    run_execute_step 'run_step() { false; print_success "misleading success"; }'

    assert_not_contains "$output" "misleading success"
}

@test "a failing step is named in the error output" {
    run_execute_step 'run_step() { false; }'

    assert_contains "$output" "Step test-step failed"
}

@test "an explicit die inside a step still stops the run" {
    run_execute_step 'run_step() { die "something went wrong"; }'

    [ "$status" -ne 0 ]
    assert_contains "$output" "something went wrong"
    assert_not_contains "$output" "MARKED"
}

# =============================================================================
# A step that succeeds must still be recorded
# =============================================================================

@test "a successful step is marked completed" {
    run_execute_step 'run_step() { print_info "doing work"; }'

    [ "$status" -eq 0 ]
    assert_contains "$output" "MARKED:test-step"
}

@test "a step returning 0 early is marked completed" {
    # The SKIP_* early-return shape used by steps 10, 11 and 13.
    run_execute_step 'run_step() { print_skip "skipped"; return 0; }'

    [ "$status" -eq 0 ]
    assert_contains "$output" "MARKED:test-step"
}

# =============================================================================
# Deliberately tolerated failures must stay tolerated
# =============================================================================

@test "a failure guarded by || true does not fail the step" {
    run_execute_step 'run_step() { false || true; print_success "done"; }'

    [ "$status" -eq 0 ]
    assert_contains "$output" "MARKED:test-step"
}

@test "a failure tested with if ! does not fail the step" {
    # e.g. `if ! check_memory; then` in step 01, `if ! check_dns_resolution` in 08.
    run_execute_step 'run_step() { if ! false; then print_info "handled"; fi; }'

    [ "$status" -eq 0 ]
    assert_contains "$output" "MARKED:test-step"
}

@test "a failure feeding an || fallback does not fail the step" {
    # e.g. `git ls-files ... && return 0` / `cmd || fallback` in step 05.
    run_execute_step 'run_step() { false || print_info "fallback"; }'

    [ "$status" -eq 0 ]
    assert_contains "$output" "MARKED:test-step"
}

@test "a failure assigned into a variable with || true does not fail the step" {
    # e.g. verify_env_file's `value=$(grep ... | cut ...) || true` in step 06,
    # which needs pipefail not to abort on a grep miss.
    run_execute_step 'run_step() { local v; v=$(grep -m1 nope /dev/null | cut -d= -f2-) || true; print_info "v=$v"; }'

    [ "$status" -eq 0 ]
    assert_contains "$output" "MARKED:test-step"
}

@test "a non-zero command in an if condition does not fail the step" {
    run_execute_step 'run_step() { if grep -q nope /dev/null; then print_info "found"; else print_info "absent"; fi; }'

    [ "$status" -eq 0 ]
    assert_contains "$output" "absent"
    assert_contains "$output" "MARKED:test-step"
}

@test "a loop whose last iteration tests false does not fail the step" {
    run_execute_step 'run_step() { for i in 1 2; do if [[ "$i" == "9" ]]; then print_info "never"; fi; done; }'

    [ "$status" -eq 0 ]
    assert_contains "$output" "MARKED:test-step"
}
