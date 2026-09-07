#!/usr/bin/env bats
# Test Compose service selection without touching a Docker daemon.

setup() {
    load '../helpers/docker.bash'
    DC_CMD='docker compose -p deployment-under-test'
    COMPOSE_IDS=''
    COMPOSE_STATUS=0
}

docker() {
    if [[ "$1" == "ps" ]]; then
        # Unrelated projects must not satisfy deployment readiness checks.
        printf '%s\n' other-postgres-1 other-web-1
        return 0
    fi
    [[ "$*" == 'compose -p deployment-under-test ps --status running -q web' ]] || return 99
    printf '%s' "$COMPOSE_IDS"
    return "$COMPOSE_STATUS"
}

@test "container_running rejects containers from other projects" {
    run container_running web
    [ "$status" -eq 1 ]
}

@test "container_running accepts the requested running Compose service" {
    COMPOSE_IDS='container-id'
    run container_running web
    [ "$status" -eq 0 ]
}

@test "container_running rejects Compose errors even with partial output" {
    COMPOSE_IDS='container-id'
    COMPOSE_STATUS=1
    run container_running web
    [ "$status" -eq 1 ]
}
