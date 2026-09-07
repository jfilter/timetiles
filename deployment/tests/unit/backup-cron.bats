#!/usr/bin/env bats
# Verify schedule detection without reading or modifying host cron jobs.

setup() {
    load '../helpers/common.bash'
    load_lib common
    setup_temp_dir
    touch "$TEST_TEMP_DIR/system-cron"
    USER_CRON=''
}

teardown() {
    teardown_temp_dir
}

grep() {
    if [[ "$*" == *'/etc/cron.d/'* ]]; then
        # Keep the real matching logic, replacing only the host input files.
        command grep "$1" "$2" "$TEST_TEMP_DIR/system-cron"
    else
        command grep "$@"
    fi
}

crontab() {
    [[ "$1" == '-l' ]] || return 1
    printf '%s\n' "$USER_CRON"
}

@test "backup check recognizes bootstrap system cron jobs" {
    echo '0 2 * * * timetiles /opt/timetiles/timetiles backup db' > "$TEST_TEMP_DIR/system-cron"
    run verify_backup_cron
    [ "$status" -eq 0 ]
}

@test "backup check recognizes direct user cron jobs" {
    USER_CRON='0 2 * * * /opt/timetiles/timetiles backup db'
    run verify_backup_cron
    [ "$status" -eq 0 ]
}

@test "backup check recognizes the generated automatic backup script" {
    USER_CRON='0 2 * * * /opt/timetiles-src/deployment/backups/auto-backup.sh >> /var/log/timetiles/backup.log 2>&1'
    run verify_backup_cron
    [ "$status" -eq 0 ]
}

@test "backup check ignores commented out schedules" {
    echo '# 0 2 * * * timetiles /opt/timetiles/timetiles backup db' > "$TEST_TEMP_DIR/system-cron"
    USER_CRON='  # 0 2 * * * /opt/timetiles/backups/auto-backup.sh'
    run verify_backup_cron
    [ "$status" -eq 1 ]
}

@test "backup check rejects an empty schedule" {
    run verify_backup_cron
    [ "$status" -eq 1 ]
}

@test "backup check does not mistake other commands for backups" {
    USER_CRON=$'0 2 * * * /opt/timetiles/timetiles backup-status\n0 2 * * * /opt/timetiles/backups/auto-backup.sh.old'
    run verify_backup_cron
    [ "$status" -eq 1 ]
}
