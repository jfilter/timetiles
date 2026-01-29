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
    skip_if_no_command "docker"
    if ! docker info &>/dev/null; then
        skip "Docker daemon not running"
    fi

    run verify_docker
    [ "$status" -eq 0 ]
    [[ "$CHECK_MSG" == *"Docker"* ]]
}

@test "verify_docker_compose returns 0 when compose available" {
    skip_if_no_command "docker"
    if ! docker compose version &>/dev/null; then
        skip "Docker Compose not available"
    fi

    run verify_docker_compose
    [ "$status" -eq 0 ]
    [[ "$CHECK_MSG" == *"Compose"* ]]
}

@test "verify_swap sets CHECK_MSG with swap info" {
    # This test just verifies the function runs and sets CHECK_MSG
    # Actual swap presence depends on system
    verify_swap || true
    [[ -n "$CHECK_MSG" ]]
}

@test "verify_backup_cron sets CHECK_MSG" {
    # Just verify function runs
    verify_backup_cron || true
    [[ -n "$CHECK_MSG" ]]
}

@test "verify_log_rotation sets CHECK_MSG" {
    verify_log_rotation || true
    [[ -n "$CHECK_MSG" ]]
}
