#!/usr/bin/env bats
# Unit tests for bootstrap/lib/state.sh

setup() {
    load '../helpers/common.bash'

    # Create temp directory for state files
    setup_temp_dir
    export STATE_DIR="$TEST_TEMP_DIR"
    export STATE_FILE="$STATE_DIR/.bootstrap-state"
    export LOCK_FILE="$STATE_DIR/.bootstrap-lock"

    # Load common first (state.sh depends on it for print functions)
    load_lib "common"
    load_lib "state"
}

teardown() {
    teardown_temp_dir
}

# =============================================================================
# State Initialization
# =============================================================================

@test "init_state creates state directory" {
    rm -rf "$STATE_DIR"
    init_state
    assert_dir_exists "$STATE_DIR"
}

@test "init_state creates state file with header" {
    init_state
    assert_file_exists "$STATE_FILE"
    run cat "$STATE_FILE"
    [[ "$output" == *"Bootstrap State"* ]]
}

@test "init_state is idempotent" {
    init_state
    init_state
    assert_file_exists "$STATE_FILE"
}

# =============================================================================
# Step Completion Tracking
# =============================================================================

@test "mark_completed adds step to state file" {
    init_state
    mark_completed "STEP_ONE"

    run cat "$STATE_FILE"
    [[ "$output" == *"STEP_ONE="* ]]
}

@test "mark_completed includes timestamp" {
    init_state
    mark_completed "STEP_ONE"

    local entry
    entry=$(grep "^STEP_ONE=" "$STATE_FILE")
    # Check timestamp format
    [[ "$entry" =~ STEP_ONE=[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]
}

@test "is_completed returns true for completed step" {
    init_state
    mark_completed "STEP_ONE"

    run is_completed "STEP_ONE"
    [ "$status" -eq 0 ]
}

@test "is_completed returns false for incomplete step" {
    init_state

    run is_completed "STEP_NEVER_RUN"
    [ "$status" -eq 1 ]
}

@test "mark_completed updates existing step" {
    init_state
    mark_completed "STEP_ONE"
    sleep 1
    mark_completed "STEP_ONE"

    # Should only have one entry
    local count
    count=$(grep -c "^STEP_ONE=" "$STATE_FILE")
    [ "$count" -eq 1 ]
}

# =============================================================================
# Step Queries
# =============================================================================

@test "get_completion_time returns timestamp" {
    init_state
    mark_completed "STEP_ONE"

    run get_completion_time "STEP_ONE"
    [ "$status" -eq 0 ]
    [[ "$output" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T ]]
}

@test "get_completion_time returns empty for incomplete step" {
    init_state

    run get_completion_time "STEP_NEVER_RUN"
    [ -z "$output" ]
}

@test "get_completed_steps lists all completed steps" {
    init_state
    mark_completed "STEP_ONE"
    mark_completed "STEP_TWO"
    mark_completed "STEP_THREE"

    run get_completed_steps
    [[ "$output" == *"STEP_ONE"* ]]
    [[ "$output" == *"STEP_TWO"* ]]
    [[ "$output" == *"STEP_THREE"* ]]
}

@test "get_last_completed returns most recent step" {
    init_state
    mark_completed "STEP_ONE"
    mark_completed "STEP_TWO"

    run get_last_completed
    [ "$output" = "STEP_TWO" ]
}

# =============================================================================
# State Management
# =============================================================================

@test "clear_state removes all steps" {
    init_state
    mark_completed "STEP_ONE"
    mark_completed "STEP_TWO"

    clear_state

    run is_completed "STEP_ONE"
    [ "$status" -eq 1 ]

    run is_completed "STEP_TWO"
    [ "$status" -eq 1 ]
}

# =============================================================================
# Lock Management
# =============================================================================

@test "acquire_lock creates lock file" {
    init_state
    acquire_lock
    assert_file_exists "$LOCK_FILE"
    release_lock
}

@test "acquire_lock stores PID" {
    init_state
    acquire_lock

    run cat "$LOCK_FILE"
    [ "$output" = "$$" ]

    release_lock
}

@test "release_lock removes lock file" {
    init_state
    acquire_lock
    release_lock

    [ ! -f "$LOCK_FILE" ]
}

@test "acquire_lock fails if another process holds lock" {
    init_state

    # Simulate another process holding the lock
    # Use current shell's parent PID which is always valid and accessible
    echo "$PPID" > "$LOCK_FILE"

    run acquire_lock
    [ "$status" -eq 1 ]

    rm -f "$LOCK_FILE"
}

@test "acquire_lock removes stale lock" {
    init_state

    # Create lock with non-existent PID
    echo "999999999" > "$LOCK_FILE"

    run acquire_lock
    [ "$status" -eq 0 ]

    release_lock
}

# =============================================================================
# Config Persistence
# =============================================================================

@test "save_config_to_state creates config file" {
    init_state
    save_config_to_state "TEST_KEY" "test_value"

    assert_file_exists "$STATE_DIR/.bootstrap-config"
}

@test "save_config_to_state stores key-value pair" {
    init_state
    save_config_to_state "TEST_KEY" "test_value"

    run cat "$STATE_DIR/.bootstrap-config"
    [[ "$output" == *"TEST_KEY=test_value"* ]]
}

@test "load_config_from_state sets variables" {
    init_state
    save_config_to_state "MY_VAR" "my_value"

    unset MY_VAR
    load_config_from_state

    [ "$MY_VAR" = "my_value" ]
}

@test "load_config_from_state returns 1 if no config" {
    init_state
    rm -f "$STATE_DIR/.bootstrap-config"

    run load_config_from_state
    [ "$status" -eq 1 ]
}
