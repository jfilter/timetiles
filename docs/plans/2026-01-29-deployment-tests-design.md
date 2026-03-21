# Deployment Test Suite Design

> BATS-based test suite for deployment scripts, running locally in Multipass VM and on GHA Ubuntu runner.

## Overview

A comprehensive test suite for deployment scripts that:

- Uses BATS (Bash Automated Testing System) for readable, maintainable tests
- Runs unit tests for shell functions (fast, no Docker)
- Runs integration tests for Docker/compose/nginx (needs Docker)
- Executes locally inside a Multipass VM for production-like environment
- Executes on GHA Ubuntu runner with the same test scripts

## Goals

1. **Catch bugs early** - Run tests locally before pushing to GHA
2. **Single source of truth** - Same tests run locally and on CI
3. **Fast feedback** - Unit tests run in seconds without Docker
4. **Comprehensive coverage** - Bootstrap libs, CLI, Docker lifecycle, backup/restore, nginx

## Test Structure

```
deployment/tests/
├── unit/
│   ├── common-lib.bats       # bootstrap/lib/common.sh functions
│   ├── state-lib.bats        # bootstrap/lib/state.sh functions
│   ├── cli-parsing.bats      # timetiles CLI argument handling
│   └── config-validation.bats # bootstrap.conf parsing
├── integration/
│   ├── docker-lifecycle.bats # up/down/restart/status
│   ├── backup-restore.bats   # backup/restore commands
│   └── nginx-routing.bats    # HTTP/HTTPS, redirects, headers
├── helpers/
│   ├── common.bash           # Shared test utilities
│   ├── docker.bash           # Docker-specific helpers
│   ├── setup-test-env.sh     # Environment setup
│   └── teardown-test-env.sh  # Environment cleanup
├── run-unit.sh               # Run unit tests only
├── run-integration.sh        # Run integration tests
└── run-all.sh                # Run everything
```

## Test Environments

### Local (Multipass VM)

```
┌─────────────────────────────────────────┐
│  Developer Mac                          │
│  └─ test-multipass.sh                   │
│      └─ Creates Ubuntu 24.04 VM         │
│          └─ deployment/tests/run-all.sh │
│              ├─ run-unit.sh             │
│              └─ run-integration.sh      │
└─────────────────────────────────────────┘
```

### GHA (Ubuntu Runner)

```
┌─────────────────────────────────────────┐
│  GHA Ubuntu Runner                      │
│  └─ deployment/tests/run-all.sh         │
│      ├─ run-unit.sh                     │
│      └─ run-integration.sh              │
└─────────────────────────────────────────┘
```

Same tests, same scripts. The Multipass VM and GHA Ubuntu runner provide equivalent environments.

## Unit Tests

### common-lib.bats

Tests for `bootstrap/lib/common.sh`:

```bash
@test "print_success outputs green checkmark" {
  load '../helpers/common.bash'
  load_lib "common"
  run print_success "test message"
  [[ "$output" == *"✓"* ]]
  [[ "$output" == *"test message"* ]]
}

@test "validate_domain rejects invalid domains" {
  load '../helpers/common.bash'
  load_lib "common"
  run validate_domain "not a domain!"
  [ "$status" -ne 0 ]
}

@test "validate_email accepts valid email" {
  load '../helpers/common.bash'
  load_lib "common"
  run validate_email "test@example.com"
  [ "$status" -eq 0 ]
}
```

### cli-parsing.bats

Tests for `timetiles` CLI:

```bash
@test "timetiles without args shows usage" {
  run ./timetiles
  [[ "$output" == *"Usage"* ]]
}

@test "timetiles backup requires subcommand" {
  run ./timetiles backup
  [[ "$output" == *"db"* ]] || [[ "$output" == *"full"* ]]
}

@test "timetiles unknown command fails" {
  run ./timetiles notacommand
  [ "$status" -ne 0 ]
}
```

### state-lib.bats

Tests for `bootstrap/lib/state.sh`:

```bash
@test "state_set creates state file" {
  load '../helpers/common.bash'
  load_lib "state"
  STATE_FILE=$(mktemp)
  state_set "TEST_KEY" "test_value"
  grep -q "TEST_KEY=test_value" "$STATE_FILE"
}
```

## Integration Tests

### docker-lifecycle.bats

```bash
setup() {
  load '../helpers/docker.bash'
}

@test "timetiles up starts all containers" {
  run ./timetiles up
  [ "$status" -eq 0 ]

  run docker ps --format '{{.Names}}'
  [[ "$output" == *"postgres"* ]]
  [[ "$output" == *"web"* ]]
  [[ "$output" == *"nginx"* ]]
}

@test "timetiles status shows healthy" {
  run ./timetiles status
  [ "$status" -eq 0 ]
}

@test "timetiles restart recovers cleanly" {
  run ./timetiles restart
  [ "$status" -eq 0 ]

  wait_for_health
  run curl -sf http://localhost/api/health
  [ "$status" -eq 0 ]
}
```

### backup-restore.bats

Extracted from existing GHA workflow:

```bash
@test "backup db creates gzipped file" {
  run ./timetiles backup db
  [ "$status" -eq 0 ]

  run ls backups/db-*.sql.gz
  [ "$status" -eq 0 ]
}

@test "backup full creates db and uploads" {
  run ./timetiles backup full
  [ "$status" -eq 0 ]

  run ls backups/db-*.sql.gz
  [ "$status" -eq 0 ]
  run ls backups/uploads-*.tar.gz
  [ "$status" -eq 0 ]
}

@test "restore recovers deleted data" {
  # Insert test data
  run_sql "INSERT INTO payload.users (email, role, created_at, updated_at)
           VALUES ('test@example.com', 'user', NOW(), NOW());"

  # Backup
  run ./timetiles backup db
  BACKUP_FILE=$(ls -t backups/db-*.sql.gz | head -1)

  # Delete
  run_sql "DELETE FROM payload.users WHERE email = 'test@example.com';"

  # Restore
  echo "yes" | ./timetiles restore "$(basename $BACKUP_FILE)"

  # Verify
  COUNT=$(run_sql_quiet "SELECT COUNT(*) FROM payload.users WHERE email = 'test@example.com';")
  [ "$COUNT" -eq 1 ]
}
```

### nginx-routing.bats

```bash
@test "HTTP redirects to HTTPS" {
  run curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health
  [ "$output" = "301" ]
}

@test "HTTPS health endpoint returns 200" {
  run curl -sfk https://localhost/api/health
  [ "$status" -eq 0 ]
}

@test "security headers present" {
  run curl -kI https://localhost/
  [[ "$output" == *"X-Frame-Options"* ]]
  [[ "$output" == *"X-Content-Type-Options"* ]]
}

@test "ACME challenge path accessible over HTTP" {
  # Create test challenge file
  run_in_container certbot "mkdir -p /var/www/certbot/.well-known/acme-challenge"
  run_in_container certbot "echo 'test' > /var/www/certbot/.well-known/acme-challenge/test.txt"

  run curl -f http://localhost/.well-known/acme-challenge/test.txt
  [ "$status" -eq 0 ]
}
```

## Test Helpers

### helpers/common.bash

```bash
# Project paths
DEPLOY_DIR="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
BOOTSTRAP_DIR="$DEPLOY_DIR/bootstrap"

# Source a library for testing
load_lib() {
  source "$BOOTSTRAP_DIR/lib/$1.sh"
}

# Assert string contains substring
assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "Expected '$haystack' to contain '$needle'"
    return 1
  fi
}

# Create temp directory cleaned up after test
setup_temp_dir() {
  TEST_TEMP_DIR=$(mktemp -d)
  export TEST_TEMP_DIR
}

teardown_temp_dir() {
  [[ -d "$TEST_TEMP_DIR" ]] && rm -rf "$TEST_TEMP_DIR"
}
```

### helpers/docker.bash

```bash
load '../helpers/common.bash'

DC_CMD="docker compose -f $DEPLOY_DIR/docker-compose.prod.yml -f $DEPLOY_DIR/docker-compose.test.yml --env-file $DEPLOY_DIR/.env.production"

# Wait for health endpoint
wait_for_health() {
  local max_attempts=${1:-30}
  local attempt=0

  while [[ $attempt -lt $max_attempts ]]; do
    if curl -sfk https://localhost/api/health &>/dev/null; then
      return 0
    fi
    sleep 2
    ((attempt++))
  done

  echo "Health check timed out after $max_attempts attempts"
  return 1
}

# Run SQL in postgres container
run_sql() {
  $DC_CMD exec -T postgres bash -c \
    "PGPASSWORD=\$POSTGRES_PASS psql -h localhost -U \$POSTGRES_USER -d \$POSTGRES_DBNAME -c \"$1\""
}

run_sql_quiet() {
  $DC_CMD exec -T postgres bash -c \
    "PGPASSWORD=\$POSTGRES_PASS psql -h localhost -U \$POSTGRES_USER -d \$POSTGRES_DBNAME -t -c \"$1\"" | tr -d ' '
}

# Run command in container
run_in_container() {
  local container="$1"
  shift
  $DC_CMD exec -T "$container" "$@"
}

# Check if container is running
container_running() {
  docker ps --format '{{.Names}}' | grep -q "$1"
}
```

## Runner Scripts

### run-unit.sh

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install bats if needed
if ! command -v bats &>/dev/null; then
  echo "Installing bats..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    brew install bats-core
  else
    sudo apt-get update && sudo apt-get install -y bats
  fi
fi

echo "Running unit tests..."
bats "$SCRIPT_DIR/unit/"
```

### run-integration.sh

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Verify Docker is running
if ! docker info &>/dev/null; then
  echo "Error: Docker is not running"
  exit 1
fi

# Setup test environment
"$SCRIPT_DIR/helpers/setup-test-env.sh"

echo "Running integration tests..."
bats "$SCRIPT_DIR/integration/"

# Cleanup
"$SCRIPT_DIR/helpers/teardown-test-env.sh"
```

### run-all.sh

```bash
#!/bin/bash
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== Unit Tests ==="
"$SCRIPT_DIR/run-unit.sh"

echo ""
echo "=== Integration Tests ==="
"$SCRIPT_DIR/run-integration.sh"

echo ""
echo "All tests passed!"
```

## Multipass Test Runner (Reworked)

Reworked `deployment/bootstrap/test-multipass.sh`:

```bash
#!/bin/bash
# Creates Ubuntu VM and runs the full test suite inside it
set -eo pipefail

VM_NAME="timetiles-test"
VM_CPUS=2
VM_MEMORY="4G"
VM_DISK="20G"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Parse arguments
SHELL_MODE=false
DESTROY_MODE=false
KEEP_VM=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --shell) SHELL_MODE=true; shift ;;
        --destroy) DESTROY_MODE=true; shift ;;
        --keep) KEEP_VM=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Handle --destroy
if $DESTROY_MODE; then
    multipass delete "$VM_NAME" --purge 2>/dev/null || true
    echo "VM destroyed"
    exit 0
fi

# Handle --shell with existing VM
if $SHELL_MODE; then
    if multipass info "$VM_NAME" &>/dev/null; then
        multipass shell "$VM_NAME"
        exit 0
    else
        echo "VM doesn't exist. Run without --shell first."
        exit 1
    fi
fi

# Check multipass installed
if ! command -v multipass &>/dev/null; then
    echo "Multipass not installed. Install with: brew install multipass"
    exit 1
fi

echo "=== Creating Ubuntu 24.04 VM ==="
multipass delete "$VM_NAME" --purge 2>/dev/null || true
multipass launch 24.04 --name "$VM_NAME" --cpus "$VM_CPUS" --memory "$VM_MEMORY" --disk "$VM_DISK"

echo "=== Transferring codebase ==="
COPYFILE_DISABLE=1 tar --exclude='node_modules' --exclude='.git' --exclude='.next' \
    --exclude='dist' --exclude='.turbo' --exclude='coverage' \
    -czf /tmp/timetiles-test.tar.gz -C "$PROJECT_ROOT" .

multipass transfer /tmp/timetiles-test.tar.gz "${VM_NAME}:/tmp/"
multipass exec "$VM_NAME" -- mkdir -p /home/ubuntu/timetiles
multipass exec "$VM_NAME" -- tar -xzf /tmp/timetiles-test.tar.gz -C /home/ubuntu/timetiles
rm /tmp/timetiles-test.tar.gz

echo "=== Installing dependencies ==="
multipass exec "$VM_NAME" -- sudo apt-get update
multipass exec "$VM_NAME" -- sudo apt-get install -y docker.io docker-compose-v2 bats
multipass exec "$VM_NAME" -- sudo usermod -aG docker ubuntu
multipass exec "$VM_NAME" -- sudo systemctl enable docker
multipass exec "$VM_NAME" -- sudo systemctl start docker

# Need to reconnect for group membership
echo "=== Running tests ==="
multipass exec "$VM_NAME" -- sg docker -c "cd /home/ubuntu/timetiles/deployment/tests && ./run-all.sh"

TEST_EXIT=$?

if ! $KEEP_VM; then
    echo "=== Cleaning up VM ==="
    multipass delete "$VM_NAME" --purge
fi

exit $TEST_EXIT
```

## Makefile Targets

Add to root `Makefile`:

```makefile
# Deployment tests
test-deploy-unit:
	@cd deployment/tests && ./run-unit.sh

test-deploy-integration:
	@cd deployment/tests && ./run-integration.sh

test-deploy-ci:
	@cd deployment/tests && ./run-all.sh

test-deploy:
	@cd deployment/bootstrap && ./test-multipass.sh
```

## GHA Workflow Update

Update `.github/workflows/test-deployment.yml` to use test scripts:

```yaml
- name: Run deployment tests
  run: |
    cd deployment/tests
    ./run-all.sh
```

The workflow keeps setup steps (Docker buildx, SSL cert generation) but delegates test logic to the scripts.

## Files to Create

1. `deployment/tests/unit/common-lib.bats`
2. `deployment/tests/unit/state-lib.bats`
3. `deployment/tests/unit/cli-parsing.bats`
4. `deployment/tests/unit/config-validation.bats`
5. `deployment/tests/integration/docker-lifecycle.bats`
6. `deployment/tests/integration/backup-restore.bats`
7. `deployment/tests/integration/nginx-routing.bats`
8. `deployment/tests/helpers/common.bash`
9. `deployment/tests/helpers/docker.bash`
10. `deployment/tests/helpers/setup-test-env.sh`
11. `deployment/tests/helpers/teardown-test-env.sh`
12. `deployment/tests/run-unit.sh`
13. `deployment/tests/run-integration.sh`
14. `deployment/tests/run-all.sh`
15. Rework `deployment/bootstrap/test-multipass.sh`
16. Update `.github/workflows/test-deployment.yml`
17. Update root `Makefile`

## Implementation Order

1. Create test directory structure and helpers
2. Create runner scripts
3. Write unit tests for common-lib (validates setup works)
4. Write remaining unit tests
5. Write integration tests (extract from GHA workflow)
6. Rework test-multipass.sh
7. Update GHA workflow to use test scripts
8. Update Makefile
9. Test locally with Multipass
10. Verify GHA workflow passes
