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

@test "backup rejects unknown arguments before loading credentials" {
    run "$TEST_CLI" backup invalidsubcmd
    [ "$status" -eq 1 ]
    [[ "$output" == *"Unknown backup argument: invalidsubcmd"* ]]
}

@test "backup rejects conflicting subcommands" {
    run "$TEST_CLI" backup db uploads
    [ "$status" -eq 1 ]
    [[ "$output" == *"Specify only one backup subcommand"* ]]
}

@test "backup rejects disable outside automatic backup management" {
    run "$TEST_CLI" backup --disable
    [ "$status" -eq 1 ]
    [[ "$output" == *"--disable requires backup auto"* ]]
}

setup_backup_commands() {
    export RESTIC_PASSWORD='fixture-password'
    export RESTIC_REPOSITORY="$TEST_TEMP_DIR/local-repo"
    export RESTIC_OFFSITE_REPOSITORY='s3:fixture.test/backups'
    mkdir -p "$TEST_TEMP_DIR/bin"
    cat > "$TEST_TEMP_DIR/bin/restic" << 'EOF'
#!/bin/bash
printf '%s\n' "$@"
EOF
    cat > "$TEST_TEMP_DIR/bin/crontab" << 'EOF'
#!/bin/bash
if [[ "${1:-}" == '-l' ]]; then
    echo '# existing fixture crontab'
else
    cat >/dev/null
fi
EOF
    chmod +x "$TEST_TEMP_DIR/bin/"*
    export PATH="$TEST_TEMP_DIR/bin:$PATH"
}

@test "backup list accepts offsite after its subcommand" {
    setup_backup_commands
    run "$TEST_CLI" backup list --offsite
    [ "$status" -eq 0 ]
    [[ "$output" == *"s3:fixture.test/backups"* ]]
    [[ "$output" != *"$TEST_TEMP_DIR/local-repo"* ]]
}

@test "backup list accepts offsite before its subcommand" {
    setup_backup_commands
    run "$TEST_CLI" backup --offsite list
    [ "$status" -eq 0 ]
    [[ "$output" == *"s3:fixture.test/backups"* ]]
}

@test "backup auto preserves offsite before its subcommand" {
    setup_backup_commands
    run "$TEST_CLI" backup --offsite auto
    [ "$status" -eq 0 ]
    grep -qxF './timetiles backup --offsite' "$TEST_TEMP_DIR/deployment/backups/auto-backup.sh"
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
