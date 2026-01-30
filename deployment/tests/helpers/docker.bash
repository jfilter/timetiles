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
