#!/usr/bin/env bats
# Unit tests for bootstrap/lib/common.sh

setup() {
    load '../helpers/common.bash'
    load_lib "common"
}

# =============================================================================
# Print Functions
# =============================================================================

@test "print_success outputs green checkmark" {
    run print_success "test message"
    [[ "$output" == *"✓"* ]]
    [[ "$output" == *"test message"* ]]
}

@test "print_error outputs red X to stderr" {
    run print_error "error message"
    [[ "$output" == *"✗"* ]]
    [[ "$output" == *"error message"* ]]
}

@test "print_warning outputs yellow warning" {
    run print_warning "warning message"
    [[ "$output" == *"⚠"* ]]
    [[ "$output" == *"warning message"* ]]
}

@test "print_info outputs blue info" {
    run print_info "info message"
    [[ "$output" == *"ℹ"* ]]
    [[ "$output" == *"info message"* ]]
}

@test "print_step outputs cyan arrow" {
    run print_step "step message"
    [[ "$output" == *"▶"* ]]
    [[ "$output" == *"step message"* ]]
}

@test "print_header outputs formatted header" {
    run print_header "Header Text"
    [[ "$output" == *"Header Text"* ]]
    [[ "$output" == *"═"* ]]
}

# =============================================================================
# Error Handling
# =============================================================================

@test "die exits with code 1 by default" {
    run bash -c 'source '"$BOOTSTRAP_DIR"'/lib/common.sh; die "error"'
    [ "$status" -eq 1 ]
}

@test "die exits with custom code" {
    run bash -c 'source '"$BOOTSTRAP_DIR"'/lib/common.sh; die "error" 42'
    [ "$status" -eq 42 ]
}

# =============================================================================
# Utility Functions
# =============================================================================

@test "timestamp returns ISO format" {
    run timestamp
    [ "$status" -eq 0 ]
    # Check format: YYYY-MM-DDTHH:MM:SSZ
    [[ "$output" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]]
}

@test "is_interactive returns false in non-interactive" {
    run bash -c 'source '"$BOOTSTRAP_DIR"'/lib/common.sh; is_interactive && echo yes || echo no'
    [[ "$output" == "no" ]]
}

@test "check_command returns 0 for existing command" {
    run check_command "bash"
    [ "$status" -eq 0 ]
}

@test "check_command returns 1 for non-existing command" {
    run check_command "definitely_not_a_real_command_12345"
    [ "$status" -eq 1 ]
}

# =============================================================================
# Retry Function
# =============================================================================

@test "retry succeeds on first try" {
    run retry 3 1 true
    [ "$status" -eq 0 ]
}

@test "retry fails after max attempts" {
    run retry 2 0 false
    [ "$status" -eq 1 ]
    [[ "$output" == *"failed after 2 attempts"* ]]
}

@test "retry succeeds when command eventually passes" {
    # Create a temp file that tracks attempts
    local counter_file
    counter_file=$(mktemp)
    echo "0" > "$counter_file"

    # Command that fails twice then succeeds
    test_cmd() {
        local count
        count=$(cat "$counter_file")
        count=$((count + 1))
        echo "$count" > "$counter_file"
        [ "$count" -ge 3 ]
    }

    run retry 5 0 test_cmd
    [ "$status" -eq 0 ]

    rm -f "$counter_file"
}

# =============================================================================
# Verification Functions (used by timetiles check)
# =============================================================================

@test "verify_docker returns 0 when docker is running" {
    # Check if docker command exists
    command -v docker &>/dev/null || skip "Docker command not found"
    # Check if docker daemon is running (this might hang or error on some systems)
    timeout 5 docker info &>/dev/null 2>&1 || skip "Docker daemon not running"

    # Call directly (not with run) to capture CHECK_MSG variable
    verify_docker
    local status_code=$?
    [ "$status_code" -eq 0 ]
    [[ "$CHECK_MSG" == *"Docker"* ]]
}

@test "verify_docker_compose returns 0 when compose available" {
    # Check if docker command exists
    command -v docker &>/dev/null || skip "Docker command not found"
    # Check if docker compose is available
    timeout 5 docker compose version &>/dev/null 2>&1 || skip "Docker Compose not available"

    # Call directly (not with run) to capture CHECK_MSG variable
    verify_docker_compose
    local status_code=$?
    [ "$status_code" -eq 0 ]
    [[ "$CHECK_MSG" == *"Compose"* ]]
}

# Stands in for `free -m`, reporting $SWAP_MB of swap.
free() { echo "Swap: $SWAP_MB 0 $SWAP_MB"; }

@test "verify_swap passes with 1GB or more" {
    SWAP_MB=2048
    local rc=0
    verify_swap || rc=$?
    [ "$rc" -eq 0 ]
    [[ "$CHECK_MSG" == "Swap configured (2048MB)" ]]
}

@test "verify_swap fails when swap is small" {
    SWAP_MB=512
    local rc=0
    verify_swap || rc=$?
    [ "$rc" -eq 1 ]
    [[ "$CHECK_MSG" == "Swap is small (512MB, recommend 2GB+)" ]]
}

@test "verify_swap fails without swap" {
    SWAP_MB=0
    local rc=0
    verify_swap || rc=$?
    [ "$rc" -eq 1 ]
    [[ "$CHECK_MSG" == "No swap configured" ]]
}

@test "verify_log_rotation passes with a timetiles config" {
    touch "$BATS_TEST_TMPDIR/timetiles"
    local rc=0
    verify_log_rotation "$BATS_TEST_TMPDIR" || rc=$?
    [ "$rc" -eq 0 ]
    [[ "$CHECK_MSG" == "Log rotation configured" ]]
}

@test "verify_log_rotation fails without a config" {
    local rc=0
    verify_log_rotation "$BATS_TEST_TMPDIR" || rc=$?
    [ "$rc" -eq 1 ]
    [[ "$CHECK_MSG" == "Log rotation not configured" ]]
}
