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

@test "every timetiles command hint names an existing command" {
    local labels hints cmd
    labels=$(grep -oE '^    [a-z|-]+\)' "$DEPLOY_DIR/timetiles" | tr -d ' )' | tr '|' '\n')
    hints=$(grep -E '(^|[[:space:]])(echo|print_[a-z]+) ' "$DEPLOY_DIR/timetiles" \
        | grep -oE 'timetiles [a-z][a-z-]*' | cut -d' ' -f2 | sort -u)
    [ -n "$hints" ]
    for cmd in $hints; do
        grep -qxF "$cmd" <<< "$labels" || { echo "hint names unknown command: timetiles $cmd"; return 1; }
    done
}

# =============================================================================
# Restart Behavior
# =============================================================================

setup_restart_commands() {
    mkdir -p "$TEST_TEMP_DIR/bin"
    cat > "$TEST_TEMP_DIR/bin/docker" << 'EOF'
#!/bin/bash
[[ "$1" == "info" ]] && exit 0
printf '%s\n' "$*" >> "$TEST_TEMP_DIR/docker-calls"
if [[ "$*" == *" up -d"* ]]; then
    exit "${RECONCILE_STATUS:-0}"
fi
EOF
    chmod +x "$TEST_TEMP_DIR/bin/docker"
    export PATH="$TEST_TEMP_DIR/bin:$PATH"
    unset RECONCILE_STATUS
}

@test "restart reconciles configuration before restarting the whole stack" {
    setup_restart_commands
    run "$TEST_CLI" restart
    [ "$status" -eq 0 ]
    local prefix="compose -f $TEST_TEMP_DIR/deployment/docker-compose.prod.yml --env-file $TEST_TEMP_DIR/deployment/.env.production"
    [ "$(sed -n '1p' "$TEST_TEMP_DIR/docker-calls")" = "$prefix up -d" ]
    [ "$(sed -n '2p' "$TEST_TEMP_DIR/docker-calls")" = "$prefix restart" ]
    [ "$(wc -l < "$TEST_TEMP_DIR/docker-calls" | tr -d ' ')" -eq 2 ]
}

@test "restart preserves the selected service in both Docker calls" {
    setup_restart_commands
    run "$TEST_CLI" restart worker-ingest
    [ "$status" -eq 0 ]
    [[ "$(sed -n '1p' "$TEST_TEMP_DIR/docker-calls")" == *" up -d worker-ingest" ]]
    [[ "$(sed -n '2p' "$TEST_TEMP_DIR/docker-calls")" == *" restart worker-ingest" ]]
    [ "$(wc -l < "$TEST_TEMP_DIR/docker-calls" | tr -d ' ')" -eq 2 ]
}

@test "restart stops when configuration reconciliation fails" {
    setup_restart_commands
    export RECONCILE_STATUS=7
    run "$TEST_CLI" restart web
    [ "$status" -eq 7 ]
    [ "$(wc -l < "$TEST_TEMP_DIR/docker-calls" | tr -d ' ')" -eq 1 ]
    [[ "$output" != *"Services restarted!"* ]]
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

setup_offsite_commands() {
    setup_backup_commands
    mkdir -p "$TEST_TEMP_DIR/uploads"
    export UPLOAD_HOST_DIR="$TEST_TEMP_DIR/uploads"
    export TIMETILES_ALERT_SCRIPT="$TEST_TEMP_DIR/bin/alert"
    cat > "$TEST_TEMP_DIR/bin/restic" << 'EOF'
#!/bin/bash
printf '%s\n' "$*" >> "$TEST_TEMP_DIR/restic-calls"
if [[ "$2" == s3:* ]]; then
    for word in ${OFFSITE_FAIL:-}; do
        if [[ " $* " == *" $word "* ]]; then
            echo "fixture: offsite $word denied" >&2
            exit 1
        fi
    done
fi
EOF
    cat > "$TEST_TEMP_DIR/bin/docker" << 'EOF'
#!/bin/bash
[[ "$*" == *pg_dump* ]] && echo '-- fixture dump'
exit 0
EOF
    cat > "$TEST_TEMP_DIR/bin/alert" << 'EOF'
#!/bin/bash
printf '%s|%s\n' "$1" "$2" >> "$TEST_TEMP_DIR/alerts"
EOF
    chmod +x "$TEST_TEMP_DIR/bin/"*
}

@test "backup db with offsite fails and alerts when the offsite backup fails" {
    setup_offsite_commands
    export OFFSITE_FAIL=backup
    run "$TEST_CLI" backup db --offsite
    [ "$status" -eq 1 ]
    [[ "$output" == *"fixture: offsite backup denied"* ]]
    grep -q '^Offsite Backup Failed|.*fixture: offsite backup denied' "$TEST_TEMP_DIR/alerts"
}

@test "backup uploads with offsite fails and alerts when the offsite repository cannot be initialized" {
    setup_offsite_commands
    export OFFSITE_FAIL="snapshots init"
    run "$TEST_CLI" backup uploads --offsite
    [ "$status" -eq 1 ]
    grep -q '^Offsite Backup Failed|' "$TEST_TEMP_DIR/alerts"
    ! grep -q "^-r s3:fixture.test/backups backup" "$TEST_TEMP_DIR/restic-calls"
}

@test "backup with offsite fails when no offsite repository is configured" {
    setup_offsite_commands
    unset RESTIC_OFFSITE_REPOSITORY
    run "$TEST_CLI" backup db --offsite
    [ "$status" -eq 1 ]
    [[ "$output" == *"RESTIC_OFFSITE_REPOSITORY is not set"* ]]
    grep -q '^Offsite Backup Failed|' "$TEST_TEMP_DIR/alerts"
}

@test "full backup still backs up uploads when the offsite database half fails" {
    setup_offsite_commands
    export OFFSITE_FAIL=db
    run "$TEST_CLI" backup --offsite
    [ "$status" -eq 1 ]
    [[ "$output" == *"Full backup incomplete"* ]]
    grep -qxF -e "-r $RESTIC_REPOSITORY backup --tag uploads $UPLOAD_HOST_DIR" "$TEST_TEMP_DIR/restic-calls"
    grep -qxF -e "-r s3:fixture.test/backups backup --tag uploads $UPLOAD_HOST_DIR" "$TEST_TEMP_DIR/restic-calls"
}

@test "backup with offsite succeeds when both repositories accept the backup" {
    setup_offsite_commands
    run "$TEST_CLI" backup --offsite
    [ "$status" -eq 0 ]
    [[ "$output" == *"Full backup complete"* ]]
    [ ! -e "$TEST_TEMP_DIR/alerts" ]
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

prepare_auto_script() {
    setup_backup_commands
    run "$TEST_CLI" backup auto
    [ "$status" -eq 0 ]
    # Relocate the old system lock path when reproducing regressions. Never
    # open /var/lock on the test host, even when testing the unfixed generator.
    sed "s|/var/lock/timetiles-backup.lock|$TEST_TEMP_DIR/backup.lock|" \
        "$TEST_TEMP_DIR/deployment/backups/auto-backup.sh" > "$TEST_TEMP_DIR/run-auto.sh"
    cat > "$TEST_CLI" << 'EOF'
#!/bin/bash
printf '%s\n' "$*" >> "$TEST_TEMP_DIR/backup-calls"
if [[ "${2:-}" == 'prune' ]]; then
    exit "${PRUNE_STATUS:-0}"
fi
exit "${BACKUP_STATUS:-0}"
EOF
    cat > "$TEST_TEMP_DIR/bin/flock" << 'EOF'
#!/bin/bash
exit "${FLOCK_STATUS:-0}"
EOF
    chmod +x "$TEST_TEMP_DIR/bin/flock"
    unset BACKUP_STATUS PRUNE_STATUS FLOCK_STATUS
}

@test "automatic backup stops before pruning when backup fails" {
    prepare_auto_script
    export BACKUP_STATUS=23
    run bash "$TEST_TEMP_DIR/run-auto.sh"
    [ "$status" -eq 23 ]
    [ "$(cat "$TEST_TEMP_DIR/backup-calls")" = 'backup' ]
}

@test "automatic backup prunes after success and reports prune failures" {
    prepare_auto_script
    export PRUNE_STATUS=24
    run bash "$TEST_TEMP_DIR/run-auto.sh"
    [ "$status" -eq 24 ]
    [ "$(cat "$TEST_TEMP_DIR/backup-calls")" = $'backup\nbackup prune' ]
}

@test "automatic backup skips a held lock without running commands" {
    prepare_auto_script
    export FLOCK_STATUS=1
    run bash "$TEST_TEMP_DIR/run-auto.sh"
    [ "$status" -eq 0 ]
    [ ! -e "$TEST_TEMP_DIR/backup-calls" ]
}

@test "automatic backup reports lock errors instead of claiming contention" {
    prepare_auto_script
    export FLOCK_STATUS=64
    run bash "$TEST_TEMP_DIR/run-auto.sh"
    [ "$status" -eq 64 ]
    [ ! -e "$TEST_TEMP_DIR/backup-calls" ]
}

@test "automatic backup uses a deployment-owned lock path" {
    prepare_auto_script
    grep -qxF "exec 200>\"$TEST_TEMP_DIR/deployment/backups/.backup.lock\"" \
        "$TEST_TEMP_DIR/deployment/backups/auto-backup.sh"
}

setup_health_commands() {
    mkdir -p "$TEST_TEMP_DIR/bin"
    cat > "$TEST_TEMP_DIR/bin/docker" << 'EOF'
#!/bin/bash
if [[ "$*" == *"{{.Status}}"* ]]; then
    printf '%s\n' "$CONTAINER_STATUS"
fi
EOF
    printf '#!/bin/bash\nexit 0\n' > "$TEST_TEMP_DIR/bin/curl"
    chmod +x "$TEST_TEMP_DIR/bin/"*
    export PATH="$TEST_TEMP_DIR/bin:$PATH"
}

run_application_check() {
    # Exercise the real Application section without probing host SSL, DNS,
    # firewall, or system services from the comprehensive check command.
    awk '/^        print_section "Application"$/ {copy=1}
         /^        # Check scraper runner if configured$/ {exit}
         copy {print}' "$TEST_CLI" > "$TEST_TEMP_DIR/application-check.sh"
    [ -s "$TEST_TEMP_DIR/application-check.sh" ]
    run bash -c '
        print_section() { :; }
        print_ok() { echo "OK: $*"; }
        print_fail() { echo "FAIL: $*"; }
        DC_CMD="docker compose"
        ENV_FILE="$1"
        source "$2"
    ' _ "$TEST_TEMP_DIR/deployment/.env.production" "$TEST_TEMP_DIR/application-check.sh"
}

@test "status reports unhealthy nginx as unhealthy" {
    setup_health_commands
    export CONTAINER_STATUS='Up 5 minutes (unhealthy)'
    run "$TEST_CLI" status
    [ "$status" -eq 0 ]
    [[ "$output" =~ Nginx:.*'✗ Unhealthy' ]]
}

@test "status distinguishes healthy nginx from running without a healthcheck" {
    setup_health_commands
    export CONTAINER_STATUS='Up 5 minutes (healthy)'
    run "$TEST_CLI" status
    [ "$status" -eq 0 ]
    [[ "$output" =~ Nginx:.*'✓ Healthy' ]]
    export CONTAINER_STATUS='Up 5 minutes'
    run "$TEST_CLI" status
    [ "$status" -eq 0 ]
    [[ "$output" =~ Nginx:.*'✓ Running' ]]
}

@test "check reports unhealthy containers as failures" {
    setup_health_commands
    export CONTAINER_STATUS='Up 5 minutes (unhealthy)'
    run_application_check
    [ "$status" -eq 0 ]
    for service in postgres web nginx; do
        [[ "$output" == *"FAIL: $service container unhealthy"* ]]
        [[ "$output" != *"OK: $service container healthy"* ]]
    done
}

@test "check still recognizes healthy containers" {
    setup_health_commands
    export CONTAINER_STATUS='Up 5 minutes (healthy)'
    run_application_check
    [ "$status" -eq 0 ]
    for service in postgres web nginx; do
        [[ "$output" == *"OK: $service container healthy"* ]]
    done
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
