#!/usr/bin/env bats
# Integration tests for backup and restore functionality (restic-based)

setup() {
    load '../helpers/docker.bash'
    init_docker
    skip_if_no_docker
    skip_if_services_not_running

    # Load env so we have RESTIC_PASSWORD for direct restic verification
    if [[ -f "$DEPLOY_DIR/.env.production" ]]; then
        set -a
        source "$DEPLOY_DIR/.env.production"
        set +a
    fi

    export RESTIC_REPO="${RESTIC_REPOSITORY:-$DEPLOY_DIR/backups/restic-repo}"

    # Wait for postgres to be fully ready (kartoza/postgis may restart during init)
    local attempts=0
    while [[ $attempts -lt 30 ]]; do
        if $DC_CMD exec -T postgres pg_isready -h localhost -U "${DB_USER:-timetiles_user}" &>/dev/null; then
            return 0
        fi
        sleep 2
        ((attempts++))
    done
    skip "Postgres not ready after 60 seconds"
}

teardown() {
    # Clean up test data
    run_sql "DELETE FROM payload.users WHERE email = 'bats-test@example.com';" 2>/dev/null || true
}

# Helper: count restic snapshots with a given tag
count_snapshots() {
    local tag="$1"
    local result
    result=$(restic -r "$RESTIC_REPO" snapshots --json --tag "$tag" 2>/dev/null | jq 'length' 2>/dev/null)
    echo "${result:-0}"
}

# =============================================================================
# Database Backup
# =============================================================================

@test "backup db creates restic snapshot" {
    local before
    before=$(count_snapshots "db")

    run "$DEPLOY_DIR/timetiles" backup db
    [ "$status" -eq 0 ]

    local after
    after=$(count_snapshots "db")
    [ "$after" -gt "$before" ]
}

@test "backup db snapshot contains database dump" {
    "$DEPLOY_DIR/timetiles" backup db

    # Restore latest db snapshot to temp dir and check for pg_dump header
    local tmpdir
    tmpdir=$(mktemp -d)

    restic -r "$RESTIC_REPO" restore latest --tag db --target "$tmpdir" 2>/dev/null
    [ -f "$tmpdir/database.sql" ]

    run head -20 "$tmpdir/database.sql"
    [[ "$output" == *"PostgreSQL database dump"* ]]

    rm -rf "$tmpdir"
}

# =============================================================================
# Uploads Backup
# =============================================================================

@test "backup uploads creates restic snapshot" {
    local before
    before=$(count_snapshots "uploads")

    run "$DEPLOY_DIR/timetiles" backup uploads
    [ "$status" -eq 0 ]

    local after
    after=$(count_snapshots "uploads")
    [ "$after" -gt "$before" ]
}

# =============================================================================
# Full Backup
# =============================================================================

@test "backup full creates both db and uploads snapshots" {
    local db_before uploads_before
    db_before=$(count_snapshots "db")
    uploads_before=$(count_snapshots "uploads")

    run "$DEPLOY_DIR/timetiles" backup full
    [ "$status" -eq 0 ]

    local db_after uploads_after
    db_after=$(count_snapshots "db")
    uploads_after=$(count_snapshots "uploads")
    [ "$db_after" -gt "$db_before" ]
    [ "$uploads_after" -gt "$uploads_before" ]
}

# =============================================================================
# Backup Verification
# =============================================================================

@test "backup verify checks repository integrity" {
    # Ensure at least one snapshot exists
    "$DEPLOY_DIR/timetiles" backup db

    run "$DEPLOY_DIR/timetiles" backup verify
    [ "$status" -eq 0 ]
    [[ "$output" == *"verified"* ]] || [[ "$output" == *"no errors"* ]]
}

# =============================================================================
# Backup List
# =============================================================================

@test "backup list shows snapshots" {
    "$DEPLOY_DIR/timetiles" backup db

    run "$DEPLOY_DIR/timetiles" backup list
    [ "$status" -eq 0 ]
    # restic snapshots output contains snapshot IDs (8-char hex)
    [[ "$output" =~ [0-9a-f]{8} ]]
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

    # Delete data
    run_sql "DELETE FROM payload.users WHERE email = 'bats-test@example.com';"

    # Verify deleted
    count=$(run_sql_quiet "SELECT COUNT(*) FROM payload.users WHERE email = 'bats-test@example.com';")
    [ "$count" -eq 0 ]

    # Restore (pipe "y" for confirmation prompt)
    echo "y" | "$DEPLOY_DIR/timetiles" restore latest

    # Verify restored
    count=$(run_sql_quiet "SELECT COUNT(*) FROM payload.users WHERE email = 'bats-test@example.com';")
    [ "$count" -eq 1 ]
}

# =============================================================================
# Backup Cleanup
# =============================================================================

@test "backup prune applies retention policy" {
    # Ensure some snapshots exist
    "$DEPLOY_DIR/timetiles" backup db
    "$DEPLOY_DIR/timetiles" backup db

    run "$DEPLOY_DIR/timetiles" backup prune
    [ "$status" -eq 0 ]
    [[ "$output" == *"pruned"* ]] || [[ "$output" == *"Applying retention"* ]]
}
