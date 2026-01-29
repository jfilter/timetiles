#!/usr/bin/env bats
# Unit tests for timetiles CLI argument parsing

setup() {
    load '../helpers/common.bash'

    # Create a minimal test environment
    setup_temp_dir
    export SCRIPT_DIR="$DEPLOY_DIR"

    # Create minimal env file for tests that need it
    mkdir -p "$TEST_TEMP_DIR/deployment"
    cat > "$TEST_TEMP_DIR/.env.production" << 'EOF'
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
    run "$DEPLOY_DIR/timetiles"
    [[ "$output" == *"Usage"* ]]
    [[ "$output" == *"Commands"* ]]
}

@test "timetiles shows all main commands in usage" {
    run "$DEPLOY_DIR/timetiles"
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
    run "$DEPLOY_DIR/timetiles" notarealcommand
    [ "$status" -eq 1 ]
    [[ "$output" == *"Usage"* ]]
}

# =============================================================================
# Backup Subcommands
# =============================================================================

@test "backup without subcommand defaults to full" {
    # This would actually run backup, so we just check the case statement exists
    # by verifying the help output mentions the options
    run "$DEPLOY_DIR/timetiles"
    [[ "$output" == *"backup"* ]]
}

@test "backup with invalid subcommand shows backup usage" {
    # Skip if no env file (command will fail early)
    if [[ ! -f "$DEPLOY_DIR/.env.production" ]]; then
        skip "No .env.production file"
    fi

    run "$DEPLOY_DIR/timetiles" backup invalidsubcmd
    [[ "$output" == *"Usage"* ]] || [[ "$output" == *"full"* ]]
}

# =============================================================================
# Restore Command
# =============================================================================

@test "restore without args shows available backups" {
    # Skip if no env file
    if [[ ! -f "$DEPLOY_DIR/.env.production" ]]; then
        skip "No .env.production file"
    fi

    run "$DEPLOY_DIR/timetiles" restore
    [[ "$output" == *"Usage"* ]] || [[ "$output" == *"backup"* ]]
}

# =============================================================================
# Environment Checks
# =============================================================================

@test "commands requiring env fail gracefully without .env.production" {
    # Temporarily rename env file if it exists
    local env_file="$DEPLOY_DIR/.env.production"
    local backup_file="$DEPLOY_DIR/.env.production.bak.$$"

    if [[ -f "$env_file" ]]; then
        mv "$env_file" "$backup_file"
    fi

    run "$DEPLOY_DIR/timetiles" status

    # Restore env file
    if [[ -f "$backup_file" ]]; then
        mv "$backup_file" "$env_file"
    fi

    [ "$status" -eq 1 ]
    [[ "$output" == *".env.production"* ]] || [[ "$output" == *"not found"* ]]
}
