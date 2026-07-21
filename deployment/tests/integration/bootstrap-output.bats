#!/usr/bin/env bats
# Integration tests for what bootstrap itself produced.
#
# Every other integration suite runs against the .env.production that
# setup-test-env.sh regenerates from .env.production.example. That is a
# deliberate choice -- deterministic secrets, a clean restic repo -- but it
# means nothing in the harness ever looks at step 06's actual output. Bootstrap
# could write a file with placeholder secrets, a missing DATABASE_URL or an
# unsubstituted ${DOMAIN_NAME} and the whole suite would still pass, because the
# file under test was written by the harness.
#
# setup-test-env.sh keeps the original at .env.production.pre-test-backup.
# These tests assert against that copy, so they describe bootstrap, not us.

setup() {
    load '../helpers/docker.bash'
    init_docker

    BOOTSTRAP_ENV="$DEPLOY_DIR/.env.production.pre-test-backup"
    export BOOTSTRAP_ENV
}

# Read a key from bootstrap's env file. Values may be quoted.
bootstrap_env_value() {
    grep "^${1}=" "$BOOTSTRAP_ENV" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '"'
}

require_bootstrap_env() {
    if [[ ! -f "$BOOTSTRAP_ENV" ]]; then
        if [[ "${DEPLOYMENT_EXPECTED:-}" == "1" ]]; then
            echo "Expected bootstrap's .env.production to have been backed up to:" >&2
            echo "  $BOOTSTRAP_ENV" >&2
            echo "Either bootstrap never wrote one, or setup-test-env.sh stopped backing it up." >&2
            return 1
        fi
        skip "No bootstrap .env.production backup (harness did not run setup-test-env.sh)"
    fi
}

@test "bootstrap wrote an .env.production" {
    require_bootstrap_env
    [ -s "$BOOTSTRAP_ENV" ]
}

@test "bootstrap replaced every CHANGE_ME placeholder" {
    require_bootstrap_env
    run grep -n "CHANGE_ME" "$BOOTSTRAP_ENV"
    echo "$output"
    [ "$status" -ne 0 ]
}

@test "bootstrap generated a real PAYLOAD_SECRET" {
    require_bootstrap_env
    local secret
    secret="$(bootstrap_env_value PAYLOAD_SECRET)"
    [ -n "$secret" ]
    # Payload needs a long secret; the template ships a 32-char placeholder.
    [ "${#secret}" -ge 32 ]
}

@test "bootstrap generated a real DB_PASSWORD" {
    require_bootstrap_env
    local password
    password="$(bootstrap_env_value DB_PASSWORD)"
    [ -n "$password" ]
    [ "${#password}" -ge 16 ]
}

@test "bootstrap set DOMAIN_NAME to the configured domain" {
    require_bootstrap_env
    local domain
    domain="$(bootstrap_env_value DOMAIN_NAME)"
    echo "DOMAIN_NAME: $domain"
    [ -n "$domain" ]
    [ "$domain" != "your-domain.com" ]
    # An unsubstituted template reference would leave the literal here.
    [[ "$domain" != *'${'* ]]
}

@test "bootstrap left no unsubstituted shell expansions in literal values" {
    require_bootstrap_env
    # ${VAR} is legal in this file -- docker compose expands it. A bare $VAR
    # outside braces is not, and is how a broken sed shows up.
    run grep -nE '^[A-Z_]+=[^=]*\$[A-Za-z_]' "$BOOTSTRAP_ENV"
    echo "$output"
    [ "$status" -ne 0 ]
}
