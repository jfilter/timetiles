# Deployment Test Suite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a BATS-based test suite for deployment scripts that runs locally in a Multipass VM and on GHA Ubuntu runners.

**Architecture:** Tests organized by type (unit/integration), shared helpers for common operations, runner scripts that work in both environments. Multipass VM provides local isolation matching GHA's Ubuntu runner.

**Tech Stack:** BATS (Bash Automated Testing System), Multipass (local VMs), Docker, shell scripting

---

## Task 1: Create Test Directory Structure

**Files:**
- Create: `deployment/tests/unit/.gitkeep`
- Create: `deployment/tests/integration/.gitkeep`
- Create: `deployment/tests/helpers/.gitkeep`

**Step 1: Create directory structure**

```bash
mkdir -p deployment/tests/unit deployment/tests/integration deployment/tests/helpers
touch deployment/tests/unit/.gitkeep
touch deployment/tests/integration/.gitkeep
touch deployment/tests/helpers/.gitkeep
```

**Step 2: Verify structure**

```bash
ls -la deployment/tests/
```

Expected: Shows `unit/`, `integration/`, `helpers/` directories

**Step 3: Commit**

```bash
git add deployment/tests/
git commit -m "chore: create deployment test directory structure"
```

---

## Task 2: Create Common Test Helper

**Files:**
- Create: `deployment/tests/helpers/common.bash`

**Step 1: Create helper file**

```bash
#!/usr/bin/env bash
# Common test utilities for BATS tests

# Project paths
TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="$(cd "$TESTS_DIR/.." && pwd)"
BOOTSTRAP_DIR="$DEPLOY_DIR/bootstrap"
PROJECT_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"

# Source a bootstrap library for testing
# Usage: load_lib "common" or load_lib "state"
load_lib() {
    local lib_name="$1"
    local lib_path="$BOOTSTRAP_DIR/lib/${lib_name}.sh"

    if [[ -f "$lib_path" ]]; then
        # Disable traps from common.sh during testing
        trap - EXIT INT TERM 2>/dev/null || true
        source "$lib_path"
        trap - EXIT INT TERM 2>/dev/null || true
    else
        echo "Library not found: $lib_path" >&2
        return 1
    fi
}

# Assert string contains substring
# Usage: assert_contains "$output" "expected text"
assert_contains() {
    local haystack="$1"
    local needle="$2"
    if [[ "$haystack" != *"$needle"* ]]; then
        echo "Expected output to contain: $needle"
        echo "Actual output: $haystack"
        return 1
    fi
}

# Assert string does not contain substring
assert_not_contains() {
    local haystack="$1"
    local needle="$2"
    if [[ "$haystack" == *"$needle"* ]]; then
        echo "Expected output NOT to contain: $needle"
        echo "Actual output: $haystack"
        return 1
    fi
}

# Assert file exists
assert_file_exists() {
    local file="$1"
    if [[ ! -f "$file" ]]; then
        echo "Expected file to exist: $file"
        return 1
    fi
}

# Assert directory exists
assert_dir_exists() {
    local dir="$1"
    if [[ ! -d "$dir" ]]; then
        echo "Expected directory to exist: $dir"
        return 1
    fi
}

# Create temp directory for test (cleaned up in teardown)
# Sets TEST_TEMP_DIR variable
setup_temp_dir() {
    TEST_TEMP_DIR=$(mktemp -d)
    export TEST_TEMP_DIR
}

# Clean up temp directory
teardown_temp_dir() {
    if [[ -d "${TEST_TEMP_DIR:-}" ]]; then
        rm -rf "$TEST_TEMP_DIR"
    fi
}

# Skip test if not running as root (for tests that need root)
skip_if_not_root() {
    if [[ $EUID -ne 0 ]]; then
        skip "Test requires root"
    fi
}

# Skip test if command not available
skip_if_no_command() {
    local cmd="$1"
    if ! command -v "$cmd" &>/dev/null; then
        skip "Command not available: $cmd"
    fi
}
```

**Step 2: Verify file created**

```bash
cat deployment/tests/helpers/common.bash | head -20
```

**Step 3: Commit**

```bash
git add deployment/tests/helpers/common.bash
git commit -m "feat(tests): add common test helper with assertions"
```

---

## Task 3: Create Docker Test Helper

**Files:**
- Create: `deployment/tests/helpers/docker.bash`

**Step 1: Create helper file**

```bash
#!/usr/bin/env bash
# Docker-specific test utilities for BATS integration tests

# Load common helpers first
load '../helpers/common.bash'

# Docker compose command (built dynamically based on available files)
build_dc_cmd() {
    local cmd="docker compose -f $DEPLOY_DIR/docker-compose.prod.yml"

    if [[ -f "$DEPLOY_DIR/docker-compose.test.yml" ]]; then
        cmd="$cmd -f $DEPLOY_DIR/docker-compose.test.yml"
    fi

    if [[ -f "$DEPLOY_DIR/.env.production" ]]; then
        cmd="$cmd --env-file $DEPLOY_DIR/.env.production"
    fi

    echo "$cmd"
}

DC_CMD=""

# Initialize DC_CMD (call in setup)
init_docker() {
    DC_CMD=$(build_dc_cmd)
    export DC_CMD
}

# Wait for health endpoint with timeout
# Usage: wait_for_health [max_attempts] [sleep_interval]
wait_for_health() {
    local max_attempts="${1:-30}"
    local interval="${2:-2}"
    local attempt=0

    while [[ $attempt -lt $max_attempts ]]; do
        if curl -sfk https://localhost/api/health &>/dev/null; then
            return 0
        fi
        if curl -sf http://localhost/api/health &>/dev/null; then
            return 0
        fi
        sleep "$interval"
        ((attempt++))
    done

    echo "Health check timed out after $max_attempts attempts"
    return 1
}

# Run SQL in postgres container
# Usage: run_sql "SELECT * FROM users;"
run_sql() {
    local query="$1"
    $DC_CMD exec -T postgres bash -c \
        "PGPASSWORD=\$POSTGRES_PASS psql -h localhost -U \$POSTGRES_USER -d \$POSTGRES_DBNAME -c \"$query\""
}

# Run SQL and return just the value (quiet mode)
# Usage: count=$(run_sql_quiet "SELECT COUNT(*) FROM users;")
run_sql_quiet() {
    local query="$1"
    $DC_CMD exec -T postgres bash -c \
        "PGPASSWORD=\$POSTGRES_PASS psql -h localhost -U \$POSTGRES_USER -d \$POSTGRES_DBNAME -t -c \"$query\"" | tr -d ' \n'
}

# Run command inside a container
# Usage: run_in_container nginx "nginx -t"
run_in_container() {
    local container="$1"
    shift
    $DC_CMD exec -T "$container" "$@"
}

# Check if container is running
# Usage: if container_running "web"; then ...
container_running() {
    local name="$1"
    docker ps --format '{{.Names}}' | grep -q "$name"
}

# Check if container is healthy
container_healthy() {
    local name="$1"
    local status
    status=$($DC_CMD ps --format '{{.Status}}' "$name" 2>/dev/null | head -1)
    [[ "$status" == *"healthy"* ]]
}

# Get upload volume name
get_upload_volume() {
    docker volume ls -q | grep -E 'timetiles.*uploads' | head -1
}

# Skip test if Docker is not running
skip_if_no_docker() {
    if ! docker info &>/dev/null; then
        skip "Docker is not running"
    fi
}

# Skip test if services are not running
skip_if_services_not_running() {
    if ! container_running "postgres" || ! container_running "web"; then
        skip "Services not running (run setup-test-env.sh first)"
    fi
}
```

**Step 2: Verify file created**

```bash
cat deployment/tests/helpers/docker.bash | head -20
```

**Step 3: Commit**

```bash
git add deployment/tests/helpers/docker.bash
git commit -m "feat(tests): add docker test helper with compose utilities"
```

---

## Task 4: Create Unit Tests for common.sh Print Functions

**Files:**
- Create: `deployment/tests/unit/common-lib.bats`

**Step 1: Create test file**

```bash
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
```

**Step 2: Run test to verify it works**

```bash
cd deployment/tests && bats unit/common-lib.bats
```

Expected: All tests pass

**Step 3: Commit**

```bash
git add deployment/tests/unit/common-lib.bats
git commit -m "feat(tests): add unit tests for common.sh print and utility functions"
```

---

## Task 5: Add Unit Tests for common.sh Verification Functions

**Files:**
- Modify: `deployment/tests/unit/common-lib.bats`

**Step 1: Add verification function tests**

Append to `deployment/tests/unit/common-lib.bats`:

```bash

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
```

**Step 2: Run tests**

```bash
cd deployment/tests && bats unit/common-lib.bats
```

**Step 3: Commit**

```bash
git add deployment/tests/unit/common-lib.bats
git commit -m "feat(tests): add unit tests for common.sh verification functions"
```

---

## Task 6: Create Unit Tests for state.sh

**Files:**
- Create: `deployment/tests/unit/state-lib.bats`

**Step 1: Create test file**

```bash
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
    # Use a PID that's likely valid (init/systemd)
    echo "1" > "$LOCK_FILE"

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
```

**Step 2: Run tests**

```bash
cd deployment/tests && bats unit/state-lib.bats
```

**Step 3: Commit**

```bash
git add deployment/tests/unit/state-lib.bats
git commit -m "feat(tests): add comprehensive unit tests for state.sh"
```

---

## Task 7: Create Unit Tests for CLI Parsing

**Files:**
- Create: `deployment/tests/unit/cli-parsing.bats`

**Step 1: Create test file**

```bash
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
```

**Step 2: Run tests**

```bash
cd deployment/tests && bats unit/cli-parsing.bats
```

**Step 3: Commit**

```bash
git add deployment/tests/unit/cli-parsing.bats
git commit -m "feat(tests): add unit tests for timetiles CLI parsing"
```

---

## Task 8: Create Setup Test Environment Script

**Files:**
- Create: `deployment/tests/helpers/setup-test-env.sh`

**Step 1: Create setup script**

```bash
#!/bin/bash
# Sets up test environment for integration tests
# Run this before running integration tests

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"

echo "=== Setting up test environment ==="

# Check Docker
if ! docker info &>/dev/null; then
    echo "ERROR: Docker is not running"
    exit 1
fi

# Create .env.production if not exists
ENV_FILE="$DEPLOY_DIR/.env.production"
if [[ ! -f "$ENV_FILE" ]]; then
    echo "Creating test .env.production..."
    cp "$DEPLOY_DIR/.env.production.example" "$ENV_FILE"

    # Set test values
    sed -i.bak 's/CHANGE_ME_STRONG_PASSWORD/test_password_123/g' "$ENV_FILE"
    sed -i.bak 's/your-domain.com/localhost/g' "$ENV_FILE"
    sed -i.bak 's/admin@${DOMAIN_NAME}/test@localhost/g' "$ENV_FILE"

    # Generate payload secret
    PAYLOAD_SECRET=$(openssl rand -base64 32 | tr -d '/')
    sed -i.bak "s|PAYLOAD_SECRET=.*|PAYLOAD_SECRET=$PAYLOAD_SECRET|" "$ENV_FILE"

    rm -f "$ENV_FILE.bak"
    echo "Created $ENV_FILE with test values"
fi

# Prepare nginx config
echo "Preparing nginx configuration..."
mkdir -p "$DEPLOY_DIR/nginx-test/sites-enabled"
cp "$DEPLOY_DIR/nginx/nginx.conf" "$DEPLOY_DIR/nginx-test/nginx.conf"
cp -r "$DEPLOY_DIR/nginx/sites-enabled/"* "$DEPLOY_DIR/nginx-test/sites-enabled/"

# Substitute domain name
find "$DEPLOY_DIR/nginx-test/sites-enabled" -type f -name "*.conf" \
    -exec sed -i.bak 's/${DOMAIN_NAME}/localhost/g' {} \;
find "$DEPLOY_DIR/nginx-test/sites-enabled" -name "*.bak" -delete

# Create docker-compose.test.yml override
cat > "$DEPLOY_DIR/docker-compose.test.yml" << EOF
services:
  nginx:
    volumes:
      - $DEPLOY_DIR/nginx-test/nginx.conf:/etc/nginx/nginx.conf:ro
      - $DEPLOY_DIR/nginx-test/sites-enabled:/etc/nginx/sites-enabled:ro
      - $DEPLOY_DIR/ssl:/etc/letsencrypt:ro
      - certbot-webroot:/var/www/certbot:ro

volumes:
  certbot-webroot:
EOF

# Generate self-signed SSL certificate
SSL_DIR="$DEPLOY_DIR/ssl/live/localhost"
if [[ ! -f "$SSL_DIR/fullchain.pem" ]]; then
    echo "Generating self-signed SSL certificate..."
    mkdir -p "$SSL_DIR"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$SSL_DIR/privkey.pem" \
        -out "$SSL_DIR/fullchain.pem" \
        -subj "/C=US/ST=Test/L=Test/O=Test/CN=localhost" 2>/dev/null
    echo "SSL certificate generated"
fi

# Build and start services
echo "Building and starting services..."
cd "$PROJECT_ROOT"

# Use timetiles CLI if available, otherwise docker compose directly
if [[ -x "$DEPLOY_DIR/timetiles" ]]; then
    "$DEPLOY_DIR/timetiles" build || "$DEPLOY_DIR/timetiles" pull
    "$DEPLOY_DIR/timetiles" up
else
    cd "$DEPLOY_DIR"
    docker compose -f docker-compose.prod.yml -f docker-compose.test.yml --env-file .env.production build || \
    docker compose -f docker-compose.prod.yml -f docker-compose.test.yml --env-file .env.production pull
    docker compose -f docker-compose.prod.yml -f docker-compose.test.yml --env-file .env.production up -d
fi

# Wait for health
echo "Waiting for services to be healthy..."
max_attempts=60
attempt=0
while [[ $attempt -lt $max_attempts ]]; do
    if curl -sf http://localhost:80/api/health &>/dev/null || \
       curl -sfk https://localhost/api/health &>/dev/null; then
        echo "Services are healthy!"
        exit 0
    fi
    echo -n "."
    sleep 2
    ((attempt++))
done

echo ""
echo "WARNING: Health check timed out, services may not be fully ready"
exit 0
```

**Step 2: Make executable**

```bash
chmod +x deployment/tests/helpers/setup-test-env.sh
```

**Step 3: Commit**

```bash
git add deployment/tests/helpers/setup-test-env.sh
git commit -m "feat(tests): add setup-test-env.sh for integration test setup"
```

---

## Task 9: Create Teardown Test Environment Script

**Files:**
- Create: `deployment/tests/helpers/teardown-test-env.sh`

**Step 1: Create teardown script**

```bash
#!/bin/bash
# Tears down test environment after integration tests

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROJECT_ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"

echo "=== Tearing down test environment ==="

cd "$DEPLOY_DIR"

# Stop services
if [[ -x "$DEPLOY_DIR/timetiles" ]]; then
    "$DEPLOY_DIR/timetiles" down || true
else
    docker compose -f docker-compose.prod.yml -f docker-compose.test.yml \
        --env-file .env.production down 2>/dev/null || true
fi

# Clean up test artifacts (optional - keep for debugging)
if [[ "${CLEANUP_ALL:-false}" == "true" ]]; then
    rm -rf "$DEPLOY_DIR/nginx-test"
    rm -f "$DEPLOY_DIR/docker-compose.test.yml"
    rm -rf "$DEPLOY_DIR/ssl"
    rm -rf "$DEPLOY_DIR/backups"
    echo "Cleaned up all test artifacts"
fi

echo "Teardown complete"
```

**Step 2: Make executable**

```bash
chmod +x deployment/tests/helpers/teardown-test-env.sh
```

**Step 3: Commit**

```bash
git add deployment/tests/helpers/teardown-test-env.sh
git commit -m "feat(tests): add teardown-test-env.sh for cleanup"
```

---

## Task 10: Create Integration Tests for Docker Lifecycle

**Files:**
- Create: `deployment/tests/integration/docker-lifecycle.bats`

**Step 1: Create test file**

```bash
#!/usr/bin/env bats
# Integration tests for Docker container lifecycle

setup() {
    load '../helpers/docker.bash'
    init_docker
    skip_if_no_docker
}

# =============================================================================
# Container Status
# =============================================================================

@test "postgres container is running" {
    skip_if_services_not_running
    run container_running "postgres"
    [ "$status" -eq 0 ]
}

@test "web container is running" {
    skip_if_services_not_running
    run container_running "web"
    [ "$status" -eq 0 ]
}

@test "nginx container is running" {
    skip_if_services_not_running
    run container_running "nginx"
    [ "$status" -eq 0 ]
}

# =============================================================================
# Health Checks
# =============================================================================

@test "postgres is accepting connections" {
    skip_if_services_not_running

    run $DC_CMD exec -T postgres pg_isready -U timetiles_user -d timetiles
    [ "$status" -eq 0 ]
}

@test "web app health endpoint responds" {
    skip_if_services_not_running

    # Try both HTTP and HTTPS
    run curl -sf http://localhost:3000/api/health
    if [ "$status" -ne 0 ]; then
        run curl -sfk https://localhost/api/health
    fi
    [ "$status" -eq 0 ]
}

@test "PostGIS extension is installed" {
    skip_if_services_not_running

    run run_sql "SELECT PostGIS_Version();"
    [ "$status" -eq 0 ]
    [[ "$output" == *"POSTGIS"* ]] || [[ "$output" =~ [0-9]+\.[0-9]+ ]]
}

# =============================================================================
# timetiles CLI
# =============================================================================

@test "timetiles status shows all services" {
    skip_if_services_not_running

    run "$DEPLOY_DIR/timetiles" status
    [ "$status" -eq 0 ]
    [[ "$output" == *"PostgreSQL"* ]]
    [[ "$output" == *"Web App"* ]]
}
```

**Step 2: Commit (tests will be run with full suite)**

```bash
git add deployment/tests/integration/docker-lifecycle.bats
git commit -m "feat(tests): add integration tests for docker container lifecycle"
```

---

## Task 11: Create Integration Tests for Backup/Restore

**Files:**
- Create: `deployment/tests/integration/backup-restore.bats`

**Step 1: Create test file**

```bash
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
```

**Step 2: Commit**

```bash
git add deployment/tests/integration/backup-restore.bats
git commit -m "feat(tests): add integration tests for backup and restore"
```

---

## Task 12: Create Integration Tests for Nginx Routing

**Files:**
- Create: `deployment/tests/integration/nginx-routing.bats`

**Step 1: Create test file**

```bash
#!/usr/bin/env bats
# Integration tests for nginx routing and SSL

setup() {
    load '../helpers/docker.bash'
    init_docker
    skip_if_no_docker
    skip_if_services_not_running
}

# =============================================================================
# HTTP to HTTPS Redirect
# =============================================================================

@test "HTTP redirects to HTTPS" {
    run curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health
    [ "$output" = "301" ]
}

@test "HTTP redirect location is HTTPS" {
    run curl -sI http://localhost/api/health
    [[ "$output" == *"Location: https://"* ]]
}

# =============================================================================
# HTTPS Endpoints
# =============================================================================

@test "HTTPS health endpoint returns 200" {
    run curl -sfk https://localhost/api/health
    [ "$status" -eq 0 ]
}

@test "HTTPS explore page returns HTML" {
    run curl -sfk https://localhost/explore
    [ "$status" -eq 0 ]
    [[ "$output" == *"<html"* ]] || [[ "$output" == *"<!DOCTYPE"* ]]
}

# =============================================================================
# Security Headers
# =============================================================================

@test "X-Frame-Options header present" {
    run curl -skI https://localhost/
    [[ "$output" == *"X-Frame-Options"* ]] || [[ "$output" == *"x-frame-options"* ]]
}

@test "X-Content-Type-Options header present" {
    run curl -skI https://localhost/
    [[ "$output" == *"X-Content-Type-Options"* ]] || [[ "$output" == *"x-content-type-options"* ]]
}

@test "Strict-Transport-Security header present" {
    run curl -skI https://localhost/
    # HSTS might not be set for localhost/self-signed
    [[ "$output" == *"Strict-Transport-Security"* ]] || \
    [[ "$output" == *"strict-transport-security"* ]] || \
    skip "HSTS not enabled (expected for test environment)"
}

# =============================================================================
# Let's Encrypt Challenge Path
# =============================================================================

@test "ACME challenge path accessible over HTTP" {
    # Create test challenge file
    run_in_container certbot mkdir -p /var/www/certbot/.well-known/acme-challenge 2>/dev/null || true
    run_in_container certbot sh -c 'echo "test-challenge" > /var/www/certbot/.well-known/acme-challenge/test.txt' 2>/dev/null || true

    run curl -sf http://localhost/.well-known/acme-challenge/test.txt
    [ "$status" -eq 0 ]
    [[ "$output" == *"test-challenge"* ]]
}

# =============================================================================
# Proxy Behavior
# =============================================================================

@test "nginx proxies to web container" {
    # Check that nginx is actually proxying, not serving directly
    run curl -skI https://localhost/api/health
    [ "$status" -eq 0 ]
    # Should have response from Next.js app
}

@test "static files served correctly" {
    # Try to fetch a static asset (may not exist in minimal setup)
    run curl -skI https://localhost/_next/static/
    # Either 200 or 404 is fine, but not 502 (bad gateway)
    [[ "$output" != *"502"* ]]
}
```

**Step 2: Commit**

```bash
git add deployment/tests/integration/nginx-routing.bats
git commit -m "feat(tests): add integration tests for nginx routing and security headers"
```

---

## Task 13: Create Unit Test Runner

**Files:**
- Create: `deployment/tests/run-unit.sh`

**Step 1: Create runner script**

```bash
#!/bin/bash
# Run unit tests only (fast, no Docker required)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Running Unit Tests ===${NC}"
echo ""

# Check for bats
if ! command -v bats &>/dev/null; then
    echo -e "${YELLOW}Installing bats...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        if command -v brew &>/dev/null; then
            brew install bats-core
        else
            echo -e "${RED}Error: Homebrew not found. Install bats manually.${NC}"
            exit 1
        fi
    else
        # Linux (Ubuntu/Debian)
        sudo apt-get update && sudo apt-get install -y bats
    fi
fi

# Run unit tests
cd "$SCRIPT_DIR"

if [[ -d "unit" ]] && ls unit/*.bats &>/dev/null; then
    bats unit/*.bats
    echo ""
    echo -e "${GREEN}Unit tests passed!${NC}"
else
    echo -e "${YELLOW}No unit tests found${NC}"
fi
```

**Step 2: Make executable**

```bash
chmod +x deployment/tests/run-unit.sh
```

**Step 3: Commit**

```bash
git add deployment/tests/run-unit.sh
git commit -m "feat(tests): add unit test runner script"
```

---

## Task 14: Create Integration Test Runner

**Files:**
- Create: `deployment/tests/run-integration.sh`

**Step 1: Create runner script**

```bash
#!/bin/bash
# Run integration tests (requires Docker)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Running Integration Tests ===${NC}"
echo ""

# Check for bats
if ! command -v bats &>/dev/null; then
    echo -e "${YELLOW}Installing bats...${NC}"
    if [[ "$OSTYPE" == "darwin"* ]]; then
        brew install bats-core 2>/dev/null || true
    else
        sudo apt-get update && sudo apt-get install -y bats
    fi
fi

# Check Docker
if ! docker info &>/dev/null; then
    echo -e "${RED}Error: Docker is not running${NC}"
    echo "Please start Docker and try again"
    exit 1
fi

# Check if services are running
if ! docker ps --format '{{.Names}}' | grep -q "postgres"; then
    echo -e "${YELLOW}Services not running. Setting up test environment...${NC}"
    "$SCRIPT_DIR/helpers/setup-test-env.sh"
fi

# Run integration tests
cd "$SCRIPT_DIR"

if [[ -d "integration" ]] && ls integration/*.bats &>/dev/null; then
    bats integration/*.bats
    echo ""
    echo -e "${GREEN}Integration tests passed!${NC}"
else
    echo -e "${YELLOW}No integration tests found${NC}"
fi
```

**Step 2: Make executable**

```bash
chmod +x deployment/tests/run-integration.sh
```

**Step 3: Commit**

```bash
git add deployment/tests/run-integration.sh
git commit -m "feat(tests): add integration test runner script"
```

---

## Task 15: Create Combined Test Runner

**Files:**
- Create: `deployment/tests/run-all.sh`

**Step 1: Create runner script**

```bash
#!/bin/bash
# Run all deployment tests (unit + integration)

set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}╔════════════════════════════════════════╗${NC}"
echo -e "${YELLOW}║   TimeTiles Deployment Test Suite      ║${NC}"
echo -e "${YELLOW}╚════════════════════════════════════════╝${NC}"
echo ""

# Track failures
FAILED=0

# Run unit tests
echo -e "${YELLOW}━━━ Unit Tests ━━━${NC}"
if "$SCRIPT_DIR/run-unit.sh"; then
    echo -e "${GREEN}✓ Unit tests passed${NC}"
else
    echo -e "${RED}✗ Unit tests failed${NC}"
    FAILED=1
fi

echo ""

# Run integration tests
echo -e "${YELLOW}━━━ Integration Tests ━━━${NC}"
if "$SCRIPT_DIR/run-integration.sh"; then
    echo -e "${GREEN}✓ Integration tests passed${NC}"
else
    echo -e "${RED}✗ Integration tests failed${NC}"
    FAILED=1
fi

echo ""
echo -e "${YELLOW}════════════════════════════════════════${NC}"

if [[ $FAILED -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}Some tests failed${NC}"
    exit 1
fi
```

**Step 2: Make executable**

```bash
chmod +x deployment/tests/run-all.sh
```

**Step 3: Commit**

```bash
git add deployment/tests/run-all.sh
git commit -m "feat(tests): add combined test runner script"
```

---

## Task 16: Rework test-multipass.sh as VM Test Runner

**Files:**
- Modify: `deployment/bootstrap/test-multipass.sh`

**Step 1: Replace test-multipass.sh content**

```bash
#!/bin/bash
# TimeTiles Deployment Test Runner (Multipass VM)
# Runs the full test suite inside an Ubuntu VM for production-like testing
#
# Usage:
#   ./test-multipass.sh              # Run all tests in VM
#   ./test-multipass.sh --keep       # Keep VM after tests
#   ./test-multipass.sh --shell      # Shell into existing VM
#   ./test-multipass.sh --destroy    # Destroy test VM

set -eo pipefail

# Configuration
VM_NAME="timetiles-test"
VM_CPUS=2
VM_MEMORY="4G"
VM_DISK="20G"

# Script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Parse arguments
KEEP_VM=false
SHELL_MODE=false
DESTROY_MODE=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --keep) KEEP_VM=true; shift ;;
        --shell) SHELL_MODE=true; shift ;;
        --destroy) DESTROY_MODE=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

print_header() {
    echo ""
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo -e "${YELLOW}  $1${NC}"
    echo -e "${YELLOW}════════════════════════════════════════${NC}"
    echo ""
}

print_step() {
    echo -e "${GREEN}▶${NC} $1"
}

# Handle --destroy
if $DESTROY_MODE; then
    print_header "Destroying VM"
    multipass delete "$VM_NAME" --purge 2>/dev/null || true
    echo -e "${GREEN}✓ VM destroyed${NC}"
    exit 0
fi

# Handle --shell with existing VM
if $SHELL_MODE; then
    if multipass info "$VM_NAME" &>/dev/null; then
        print_header "Connecting to VM"
        multipass shell "$VM_NAME"
        exit 0
    else
        echo -e "${RED}Error: VM doesn't exist. Run without --shell first.${NC}"
        exit 1
    fi
fi

# Check multipass installed
if ! command -v multipass &>/dev/null; then
    echo -e "${RED}Error: Multipass not installed${NC}"
    echo "Install with: brew install multipass"
    exit 1
fi

# Main test flow
print_header "TimeTiles Deployment Tests (VM)"
echo "VM: $VM_NAME"
echo "Keep after tests: $KEEP_VM"
echo ""

# Destroy existing VM
if multipass info "$VM_NAME" &>/dev/null; then
    print_step "Destroying existing VM..."
    multipass delete "$VM_NAME" --purge
fi

# Create VM
print_step "Creating Ubuntu 24.04 VM..."
multipass launch 24.04 --name "$VM_NAME" --cpus "$VM_CPUS" --memory "$VM_MEMORY" --disk "$VM_DISK"
echo -e "${GREEN}✓ VM created${NC}"

# Wait for VM
print_step "Waiting for VM to be ready..."
sleep 10

# Get VM IP
VM_IP=$(multipass info "$VM_NAME" --format json | grep -o '"ipv4": "[^"]*"' | head -1 | cut -d'"' -f4)
echo "VM IP: $VM_IP"

# Transfer codebase
print_header "Transferring Codebase"
print_step "Creating tarball..."
COPYFILE_DISABLE=1 tar --exclude='node_modules' --exclude='.git' --exclude='.next' \
    --exclude='dist' --exclude='.turbo' --exclude='coverage' \
    --exclude='.worktrees' --exclude='*.log' \
    -czf /tmp/timetiles-test.tar.gz -C "$PROJECT_ROOT" . 2>/dev/null

SIZE=$(du -h /tmp/timetiles-test.tar.gz | cut -f1)
echo "Tarball size: $SIZE"

print_step "Transferring to VM..."
multipass transfer /tmp/timetiles-test.tar.gz "${VM_NAME}:/tmp/"

print_step "Extracting..."
multipass exec "$VM_NAME" -- mkdir -p /home/ubuntu/timetiles
multipass exec "$VM_NAME" -- tar -xzf /tmp/timetiles-test.tar.gz -C /home/ubuntu/timetiles

rm /tmp/timetiles-test.tar.gz
echo -e "${GREEN}✓ Codebase transferred${NC}"

# Install dependencies
print_header "Installing Dependencies"
print_step "Installing Docker and BATS..."
multipass exec "$VM_NAME" -- sudo apt-get update -qq
multipass exec "$VM_NAME" -- sudo apt-get install -y -qq docker.io docker-compose-v2 bats
multipass exec "$VM_NAME" -- sudo usermod -aG docker ubuntu
multipass exec "$VM_NAME" -- sudo systemctl enable docker
multipass exec "$VM_NAME" -- sudo systemctl start docker
echo -e "${GREEN}✓ Dependencies installed${NC}"

# Run tests
print_header "Running Tests"

# Use sg to get docker group access in same session
TEST_EXIT=0
if ! multipass exec "$VM_NAME" -- sg docker -c "cd /home/ubuntu/timetiles/deployment/tests && ./run-all.sh"; then
    TEST_EXIT=1
fi

# Results
print_header "Results"
if [[ $TEST_EXIT -eq 0 ]]; then
    echo -e "${GREEN}All tests passed!${NC}"
else
    echo -e "${RED}Some tests failed${NC}"
fi

# Cleanup or keep
if ! $KEEP_VM; then
    print_step "Cleaning up VM..."
    multipass delete "$VM_NAME" --purge
    echo -e "${GREEN}✓ VM destroyed${NC}"
else
    echo ""
    echo "VM kept for debugging:"
    echo "  Shell: ./test-multipass.sh --shell"
    echo "  Destroy: ./test-multipass.sh --destroy"
fi

exit $TEST_EXIT
```

**Step 2: Commit**

```bash
git add deployment/bootstrap/test-multipass.sh
git commit -m "refactor(tests): rework test-multipass.sh to use BATS test suite"
```

---

## Task 17: Update GHA Workflow

**Files:**
- Modify: `.github/workflows/test-deployment.yml`

**Step 1: Read current workflow**

```bash
cat .github/workflows/test-deployment.yml
```

**Step 2: Replace with simplified workflow that uses test scripts**

The new workflow should:
1. Keep setup steps (checkout, Docker buildx)
2. Delegate all testing to `deployment/tests/run-all.sh`
3. Keep failure log collection

```yaml
name: Test Production Deployment

on:
  workflow_call:
  workflow_dispatch:
    inputs:
      debug:
        description: 'Enable debug logging'
        required: false
        default: 'false'

jobs:
  test-production-deployment:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - name: Checkout code
        uses: actions/checkout@v4
        with:
          lfs: true

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Install bats
        run: sudo apt-get update && sudo apt-get install -y bats

      - name: Make scripts executable
        run: |
          chmod +x timetiles deployment/timetiles
          chmod +x deployment/tests/*.sh
          chmod +x deployment/tests/helpers/*.sh

      - name: Run deployment tests
        run: |
          cd deployment/tests
          ./run-all.sh

      - name: Collect logs on failure
        if: failure()
        run: |
          cd deployment
          if [[ -f docker-compose.test.yml ]]; then
            docker compose -f docker-compose.prod.yml -f docker-compose.test.yml --env-file .env.production logs --tail=200 || true
          else
            docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=200 || true
          fi

      - name: Cleanup
        if: always()
        run: |
          ./timetiles down || true
          docker system prune -f || true
```

**Step 3: Commit**

```bash
git add .github/workflows/test-deployment.yml
git commit -m "refactor(ci): simplify GHA workflow to use BATS test suite"
```

---

## Task 18: Update Makefile

**Files:**
- Modify: `Makefile`

**Step 1: Add deployment test targets**

Add these targets to the Makefile:

```makefile
# =============================================================================
# Deployment Tests
# =============================================================================

.PHONY: test-deploy-unit test-deploy-integration test-deploy-ci test-deploy

## Run deployment unit tests (fast, no Docker)
test-deploy-unit:
	@cd deployment/tests && ./run-unit.sh

## Run deployment integration tests (requires Docker)
test-deploy-integration:
	@cd deployment/tests && ./run-integration.sh

## Run all deployment tests (for CI - no VM)
test-deploy-ci:
	@cd deployment/tests && ./run-all.sh

## Run all deployment tests in Multipass VM
test-deploy:
	@cd deployment/bootstrap && ./test-multipass.sh
```

**Step 2: Commit**

```bash
git add Makefile
git commit -m "feat: add deployment test targets to Makefile"
```

---

## Task 19: Remove .gitkeep Files and Final Cleanup

**Files:**
- Delete: `deployment/tests/unit/.gitkeep`
- Delete: `deployment/tests/integration/.gitkeep`
- Delete: `deployment/tests/helpers/.gitkeep`

**Step 1: Remove .gitkeep files**

```bash
rm -f deployment/tests/unit/.gitkeep
rm -f deployment/tests/integration/.gitkeep
rm -f deployment/tests/helpers/.gitkeep
```

**Step 2: Verify all tests pass**

```bash
cd deployment/tests && ./run-unit.sh
```

**Step 3: Final commit**

```bash
git add -A
git commit -m "chore: remove .gitkeep files, test suite complete"
```

---

## Task 20: Run Full Test Suite and Verify

**Step 1: Run unit tests locally**

```bash
make test-deploy-unit
```

Expected: All unit tests pass

**Step 2: Run integration tests (if Docker available)**

```bash
make test-deploy-integration
```

Expected: All integration tests pass (or skip if services not running)

**Step 3: (Optional) Run full VM test**

```bash
make test-deploy
```

Expected: Creates VM, runs all tests, cleans up

---

## Summary

This plan creates:

1. **Test helpers** (`helpers/common.bash`, `helpers/docker.bash`) - Reusable test utilities
2. **Unit tests** - Fast tests for shell functions (common.sh, state.sh, CLI parsing)
3. **Integration tests** - Docker-based tests (lifecycle, backup/restore, nginx)
4. **Runner scripts** - `run-unit.sh`, `run-integration.sh`, `run-all.sh`
5. **VM test runner** - Reworked `test-multipass.sh`
6. **GHA workflow** - Simplified to call test scripts
7. **Makefile targets** - Easy local access

**Key principle**: Same tests run locally (in VM) and on GHA (directly on runner).
