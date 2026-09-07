#!/usr/bin/env bats
# Unit tests for timetiles CLI argument parsing

setup() {
    load '../helpers/common.bash'

    # Create a minimal test environment
    setup_temp_dir
    mkdir -p "$TEST_TEMP_DIR/deployment"
    cp "$DEPLOY_DIR/timetiles" "$TEST_TEMP_DIR/deployment/timetiles"
    export TEST_CLI="$TEST_TEMP_DIR/deployment/timetiles"
    unset RESTIC_PASSWORD

    # The CLI resolves configuration next to its own file, not from SCRIPT_DIR.
    cat > "$TEST_TEMP_DIR/deployment/.env.production" << 'EOF'
DB_PASSWORD=test
DOMAIN_NAME=test.local
PAYLOAD_SECRET=testsecret
EOF
}

teardown() {
    teardown_temp_dir
}

# =============================================================================
# Basic CLI Behavior
# =============================================================================

@test "timetiles without args shows usage" {
    run "$TEST_CLI"
    [[ "$output" == *"Usage"* ]]
    [[ "$output" == *"Commands"* ]]
}

@test "timetiles shows all main commands in usage" {
    run "$TEST_CLI"
    [[ "$output" == *"setup"* ]]
    [[ "$output" == *"build"* ]]
    [[ "$output" == *"up"* ]]
    [[ "$output" == *"down"* ]]
    [[ "$output" == *"restart"* ]]
    [[ "$output" == *"logs"* ]]
    [[ "$output" == *"backup"* ]]
    [[ "$output" == *"restore"* ]]
    [[ "$output" == *"status"* ]]
    [[ "$output" == *"check"* ]]
}

@test "timetiles unknown command shows usage" {
    run "$TEST_CLI" notarealcommand
    [ "$status" -eq 1 ]
    [[ "$output" == *"Usage"* ]]
}

# =============================================================================
# Backup Subcommands
# =============================================================================

@test "backup refuses to run without a restic password" {
    run "$TEST_CLI" backup
    [ "$status" -eq 1 ]
    [[ "$output" == *"RESTIC_PASSWORD not set"* ]]
}

# =============================================================================
# Restore Command
# =============================================================================

@test "restore refuses to run without a restic password" {
    run "$TEST_CLI" restore
    [ "$status" -eq 1 ]
    [[ "$output" == *"RESTIC_PASSWORD not set"* ]]
}

# =============================================================================
# Environment Checks
# =============================================================================

@test "commands requiring env fail gracefully without .env.production" {
    rm "$TEST_TEMP_DIR/deployment/.env.production"
    run "$TEST_CLI" status

    [ "$status" -eq 1 ]
    [[ "$output" == *".env.production"* ]] || [[ "$output" == *"not found"* ]]
}
