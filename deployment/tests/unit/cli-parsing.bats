#!/usr/bin/env bats
# Unit tests for timetiles CLI argument parsing

setup() {
    load '../helpers/common.bash'

    # Create a minimal test environment
    setup_temp_dir
    TEST_TEMP_DIR=$(cd "$TEST_TEMP_DIR" && pwd -P)
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
    export TEST_CRONTAB="$TEST_TEMP_DIR/crontab"
    printf '%s\n' '# existing fixture crontab' > "$TEST_CRONTAB"
    unset CRONTAB_READ_ERROR CRONTAB_WRITE_ERROR
    mkdir -p "$TEST_TEMP_DIR/bin"
    cat > "$TEST_TEMP_DIR/bin/restic" << 'EOF'
#!/bin/bash
printf '%s\n' "$@"
EOF
    cat > "$TEST_TEMP_DIR/bin/crontab" << 'EOF'
#!/bin/bash
if [[ "${1:-}" == '-l' ]]; then
    if [[ -n "${CRONTAB_READ_ERROR:-}" ]]; then
        echo 'permission denied' >&2
        exit 1
    fi
    if [[ ! -f "$TEST_CRONTAB" ]]; then
        echo "no crontab for $(id -un)" >&2
        exit 1
    fi
    cat "$TEST_CRONTAB"
else
    if [[ -n "${CRONTAB_WRITE_ERROR:-}" ]]; then
        exit 1
    fi
    content=$(cat)
    printf '%s\n' "$content" > "$TEST_CRONTAB"
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

@test "backup auto installs into an empty crontab" {
    setup_backup_commands
    : > "$TEST_CRONTAB"
    run "$TEST_CLI" backup auto
    [ "$status" -eq 0 ]
    grep -qF "$TEST_TEMP_DIR/deployment/backups/auto-backup.sh" "$TEST_CRONTAB"
}

@test "backup auto installs when no crontab exists" {
    setup_backup_commands
    rm "$TEST_CRONTAB"
    run "$TEST_CLI" backup auto
    [ "$status" -eq 0 ]
    grep -qF "$TEST_TEMP_DIR/deployment/backups/auto-backup.sh" "$TEST_CRONTAB"
}

@test "backup auto can remove the only scheduled job" {
    setup_backup_commands
    printf '0 2 * * * %s/deployment/backups/auto-backup.sh\n' "$TEST_TEMP_DIR" > "$TEST_CRONTAB"
    run "$TEST_CLI" backup auto --disable
    [ "$status" -eq 0 ]
    ! grep -q '[^[:space:]]' "$TEST_CRONTAB"
}

@test "backup auto preserves unrelated jobs and does not duplicate its own job" {
    setup_backup_commands
    local unrelated="0 3 * * * ${TEST_TEMP_DIR//./x}/deployment/backups/auto-backup.sh"
    printf '%s\n' "$unrelated" > "$TEST_CRONTAB"
    run "$TEST_CLI" backup auto
    [ "$status" -eq 0 ]
    run "$TEST_CLI" backup auto
    [ "$status" -eq 0 ]
    grep -qxF "$unrelated" "$TEST_CRONTAB"
    [ "$(grep -cF "$TEST_TEMP_DIR/deployment/backups/auto-backup.sh" "$TEST_CRONTAB")" -eq 1 ]
}

@test "backup auto leaves schedules and scripts unchanged when reading crontab fails" {
    setup_backup_commands
    export CRONTAB_READ_ERROR=1
    run "$TEST_CLI" backup auto
    [ "$status" -eq 1 ]
    [ ! -e "$TEST_TEMP_DIR/deployment/backups/auto-backup.sh" ]
    grep -qxF '# existing fixture crontab' "$TEST_CRONTAB"
}

@test "backup auto reports crontab write failures" {
    setup_backup_commands
    export CRONTAB_WRITE_ERROR=1
    run "$TEST_CLI" backup auto
    [ "$status" -eq 1 ]
    [[ "$output" != *"Automatic backups configured"* ]]
    grep -qxF '# existing fixture crontab' "$TEST_CRONTAB"
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
