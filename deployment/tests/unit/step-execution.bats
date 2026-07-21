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

# =============================================================================
# die() from inside a subshell
#
# Regression under test, observed in a VM run on 2026-07-21: step 09's systemd
# heredoc is unquoted and its body carried a comment reading
#     # `timetiles up` no longer returns ...
# The backticks made bash run `timetiles up` while expanding the heredoc. That
# is a command substitution, so it runs in a SUBSHELL. errexit tripped there,
# the inherited ERR trap called die, and die's `exit` left only the subshell.
# The result in one run:
#     ✗ Step 09-monitoring failed
#     ✓ Step 09-monitoring completed
# and bootstrap continued through steps 10-13 over a step it had already
# declared failed.
# =============================================================================

@test "a failure inside a command substitution does not mark the step completed" {
    # The substitution must feed a command that SUCCEEDS, or this proves
    # nothing: `out=$(bad-cmd)` fails in the parent too, because an assignment
    # takes the substitution's status, and errexit would catch it with or
    # without die's subshell handling. Here print_info returns 0 and swallows
    # it, so only the ERR trap inside the subshell fires -- the step 09 shape.
    run_execute_step 'run_step() { print_info "value: $(definitely-not-a-real-command)"; print_info "kept going"; }'

    [ "$status" -ne 0 ]
    ! assert_contains "$output" "MARKED:test-step"
}

@test "an unescaped backtick in an unquoted heredoc does not mark the step completed" {
    # The exact shape of the step 09 bug: a heredoc whose delimiter is unquoted,
    # with backticks in what the author meant as a comment.
    run_execute_step 'run_step() { cat > /dev/null << EOF
# `definitely-not-a-real-command` explains the setting below
Key=value
EOF
}'

    [ "$status" -ne 0 ]
    ! assert_contains "$output" "MARKED:test-step"
}

@test "no step script has an unescaped backtick inside an unquoted heredoc" {
    # The runtime guard above stops such a step from being marked completed.
    # This one stops the mistake from reaching a host at all -- the expansion
    # also silently mangles the file being written.
    run python3 - "$BOOTSTRAP_DIR" <<'PY'
import re, sys, pathlib

root = pathlib.Path(sys.argv[1])
problems = []

for path in sorted(root.rglob("*.sh")):
    lines = path.read_text().splitlines()
    i = 0
    while i < len(lines):
        m = re.search(r'<<-?\s*(["\']?)([A-Za-z_][A-Za-z0-9_]*)\1', lines[i])
        if not m:
            i += 1
            continue
        quoted, delim = bool(m.group(1)), m.group(2)
        j = i + 1
        while j < len(lines) and lines[j].strip() != delim:
            j += 1
        if not quoted:
            for k, body in enumerate(lines[i + 1:j], start=i + 2):
                if re.search(r'(?<!\\)`', body):
                    problems.append(f"{path}:{k}: {body.strip()[:80]}")
        i = j + 1

for p in problems:
    print(p)
sys.exit(1 if problems else 0)
PY

    echo "$output"
    [ "$status" -eq 0 ]
}
