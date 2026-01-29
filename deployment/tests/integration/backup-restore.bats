#!/usr/bin/env bats
# Integration tests for backup and restore functionality

setup() {
    load '../helpers/docker.bash'
    init_docker
    skip_if_no_docker
    skip_if_services_not_running

    # Create backups directory
    export BACKUP_DIR="$DEPLOY_DIR/backups"
    mkdir -p "$BACKUP_DIR"
}

teardown() {
    # Clean up test data
    run_sql "DELETE FROM payload.users WHERE email = 'bats-test@example.com';" 2>/dev/null || true
}

# =============================================================================
# Database Backup
# =============================================================================

@test "backup db creates gzipped file" {
    run "$DEPLOY_DIR/timetiles" backup db
    [ "$status" -eq 0 ]

    # Check file exists
    run ls "$BACKUP_DIR"/db-*.sql.gz
    [ "$status" -eq 0 ]
}

@test "backup db file is valid gzip" {
    "$DEPLOY_DIR/timetiles" backup db

    local latest
    latest=$(ls -t "$BACKUP_DIR"/db-*.sql.gz | head -1)

    run gunzip -t "$latest"
    [ "$status" -eq 0 ]
}

@test "backup db contains pg_dump header" {
    "$DEPLOY_DIR/timetiles" backup db

    local latest
    latest=$(ls -t "$BACKUP_DIR"/db-*.sql.gz | head -1)

    run bash -c "gunzip -c '$latest' | head -20"
    [[ "$output" == *"PostgreSQL database dump"* ]]
}

# =============================================================================
# Uploads Backup
# =============================================================================

@test "backup uploads creates tarball" {
    run "$DEPLOY_DIR/timetiles" backup uploads
    [ "$status" -eq 0 ]

    run ls "$BACKUP_DIR"/uploads-*.tar.gz
    [ "$status" -eq 0 ]
}

# =============================================================================
# Full Backup
# =============================================================================

@test "backup full creates both db and uploads" {
    run "$DEPLOY_DIR/timetiles" backup full
    [ "$status" -eq 0 ]

    # Both files should exist with same timestamp
    run ls "$BACKUP_DIR"/db-*.sql.gz
    [ "$status" -eq 0 ]

    run ls "$BACKUP_DIR"/uploads-*.tar.gz
    [ "$status" -eq 0 ]
}

# =============================================================================
# Backup Verification
# =============================================================================

@test "backup verify checks all backups" {
    # Ensure at least one backup exists
    "$DEPLOY_DIR/timetiles" backup db

    run "$DEPLOY_DIR/timetiles" backup verify
    [ "$status" -eq 0 ]
    [[ "$output" == *"valid"* ]]
}

@test "backup verify detects corrupted file" {
    # Create corrupted backup
    echo "not valid gzip" > "$BACKUP_DIR/db-corrupted-test.sql.gz"

    run "$DEPLOY_DIR/timetiles" backup verify
    [[ "$output" == *"CORRUPTED"* ]] || [[ "$output" == *"INVALID"* ]]

    rm -f "$BACKUP_DIR/db-corrupted-test.sql.gz"
}

# =============================================================================
# Backup List
# =============================================================================

@test "backup list shows available backups" {
    "$DEPLOY_DIR/timetiles" backup db

    run "$DEPLOY_DIR/timetiles" backup list
    [ "$status" -eq 0 ]
    [[ "$output" == *"Database backups"* ]]
}

# =============================================================================
# Restore
# =============================================================================

@test "restore recovers deleted data" {
    # Insert test data
    run_sql "INSERT INTO payload.users (email, role, created_at, updated_at) VALUES ('bats-test@example.com', 'user', NOW(), NOW());"

    # Verify inserted
    local count
    count=$(run_sql_quiet "SELECT COUNT(*) FROM payload.users WHERE email = 'bats-test@example.com';")
    [ "$count" -eq 1 ]

    # Backup
    "$DEPLOY_DIR/timetiles" backup db
    local backup_file
    backup_file=$(ls -t "$BACKUP_DIR"/db-*.sql.gz | head -1)

    # Delete data
    run_sql "DELETE FROM payload.users WHERE email = 'bats-test@example.com';"

    # Verify deleted
    count=$(run_sql_quiet "SELECT COUNT(*) FROM payload.users WHERE email = 'bats-test@example.com';")
    [ "$count" -eq 0 ]

    # Restore
    echo "yes" | "$DEPLOY_DIR/timetiles" restore "$(basename "$backup_file")"

    # Verify restored
    count=$(run_sql_quiet "SELECT COUNT(*) FROM payload.users WHERE email = 'bats-test@example.com';")
    [ "$count" -eq 1 ]
}

# =============================================================================
# Backup Cleanup
# =============================================================================

@test "backup prune keeps specified number" {
    # Create multiple backups
    "$DEPLOY_DIR/timetiles" backup db
    sleep 1
    "$DEPLOY_DIR/timetiles" backup db
    sleep 1
    "$DEPLOY_DIR/timetiles" backup db

    local count_before
    count_before=$(ls -1 "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | wc -l)

    # Prune to 2
    run "$DEPLOY_DIR/timetiles" backup prune 2
    [ "$status" -eq 0 ]

    local count_after
    count_after=$(ls -1 "$BACKUP_DIR"/db-*.sql.gz 2>/dev/null | wc -l)

    [ "$count_after" -le 2 ]
}
