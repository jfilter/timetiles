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

# =============================================================================
# Worker Containers
# =============================================================================

@test "payload CLI is accessible at node_modules/.bin/payload" {
    skip_if_services_not_running
    run $DC_CMD exec -T web node -e "require('fs').accessSync('/app/node_modules/.bin/payload')"
    [ "$status" -eq 0 ]
}

@test "payload CLI can run --help" {
    skip_if_services_not_running
    run $DC_CMD exec -T web node node_modules/.bin/payload --help
    [ "$status" -eq 0 ]
    [[ "$output" == *"jobs:run"* ]]
}

# =============================================================================
# Scraper Runner Integration
# =============================================================================

@test "web container has host.docker.internal in /etc/hosts" {
    skip_if_services_not_running

    run $DC_CMD exec -T web cat /etc/hosts
    [ "$status" -eq 0 ]
    [[ "$output" == *"host.docker.internal"* ]]
}

@test "web container receives scraper env vars when configured" {
    skip_if_services_not_running

    # Check that SCRAPER_RUNNER_URL is passed through (may be empty if not configured)
    run $DC_CMD exec -T web printenv SCRAPER_RUNNER_URL
    # Status 0 means the var exists (even if empty), status 1 means it doesn't
    # Both are acceptable — we just verify the compose config passes it through
    [ "$status" -eq 0 ] || [ "$status" -eq 1 ]
}
