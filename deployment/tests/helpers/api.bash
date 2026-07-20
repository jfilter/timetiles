#!/usr/bin/env bash
# Authenticated API helpers for BATS integration tests.
#
# The rest of this suite only touches unauthenticated endpoints, so this is the
# first place that needs a logged-in session. A fresh deployment has no users at
# all -- bootstrap deliberately creates none -- so the first admin is created
# through Payload's first-register endpoint, which only works while the users
# table is empty. That makes it safe: on a deployment that already has users it
# fails, and we fall through to a normal login.

load '../helpers/common.bash'

# nginx routes by Host header, so the configured domain has to be used rather
# than plain localhost -- same pattern as nginx-routing.bats. The name does not
# resolve publicly, hence --resolve on every call.
API_DOMAIN=$(grep "^DOMAIN_NAME=" "$DEPLOY_DIR/.env.production" 2>/dev/null | cut -d= -f2)
API_DOMAIN="${API_DOMAIN:-localhost}"
API_BASE="https://${API_DOMAIN}"

# Deployment-suite test credentials. Kept here rather than imported from the web
# app's test constants, which are TypeScript and not reachable from bash. Same
# spirit as setup-test-env.sh, which hardcodes its own throwaway password.
# A real TLD is required: Payload rejects bare @localhost as an invalid address,
# which silently leaves the deployment with no user to log in as.
API_TEST_EMAIL="${API_TEST_EMAIL:-deploy-test@example.com}"
API_TEST_PASSWORD="${API_TEST_PASSWORD:-deploy_test_password_123}"

API_TOKEN=""

# curl against the deployment's own nginx, whose certificate is self-signed.
_api_curl() {
    curl -sk --max-time 30 --resolve "${API_DOMAIN}:443:127.0.0.1" "$@"
}

skip_if_no_api() {
    if ! _api_curl -f "$API_BASE/api/health" >/dev/null 2>&1; then
        skip "Web app is not reachable at $API_BASE"
    fi
}

# Create the first admin if the deployment has none, then log in.
# Sets API_TOKEN. Returns non-zero when no session could be established.
api_login() {
    local body register_body

    # Create the admin the same way an operator does. Payload's first-register
    # endpoint is not usable here: the users collection forces `role: "user"` on
    # unauthenticated REST creates, so it can only ever produce a non-admin --
    # and this fixture needs admin rights for the settings global and the
    # scraper-repos. Going through the CLI also means this test covers the
    # command operators depend on, instead of a test-only back door.
    register_body=$(TIMETILES_ADMIN_PASSWORD="$API_TEST_PASSWORD" \
        "$DEPLOY_DIR/timetiles" create-admin "$API_TEST_EMAIL" 2>&1 || true)

    body=$(_api_curl -X POST "$API_BASE/api/users/login" \
        -H "Content-Type: application/json" \
        -d "$(jq -nc --arg e "$API_TEST_EMAIL" --arg p "$API_TEST_PASSWORD" \
            '{email: $e, password: $p}')")

    API_TOKEN=$(jq -r '.token // empty' <<<"$body")
    [[ -n "$API_TOKEN" ]] || {
        # Surface the server's own words. Diagnosing this after the fact is
        # unreliable: the harness tears the stack down once the suite ends, so
        # probing later reports the torn-down state rather than what the test
        # actually hit.
        API_LOGIN_ERROR="register=${register_body:0:300} login=${body:0:300}"
        echo "login failed: $API_LOGIN_ERROR" >&2
        return 1
    }
}

api_get() {
    _api_curl -H "Authorization: JWT $API_TOKEN" "$API_BASE$1"
}

# api_post <path> <json-body>
api_post() {
    _api_curl -X POST -H "Authorization: JWT $API_TOKEN" \
        -H "Content-Type: application/json" -d "$2" "$API_BASE$1"
}

# Print the HTTP status only, for assertions that care about the code.
# api_post_status <path> <json-body>
api_post_status() {
    _api_curl -o /dev/null -w '%{http_code}' -X POST \
        -H "Authorization: JWT $API_TOKEN" \
        -H "Content-Type: application/json" -d "$2" "$API_BASE$1"
}

# Poll until a jq filter over an endpoint yields a non-empty, non-null value.
#
# Deadline-bound on purpose: the faults this suite exists for (a wedged Podman,
# a worker that never picks the job up) leave a record sitting in a non-terminal
# state forever, so a poll without an upper bound would hang instead of failing.
#
# api_poll_until <path> <jq-filter> <timeout-seconds>
api_poll_until() {
    local path="$1" filter="$2" timeout="${3:-90}"
    local deadline=$((SECONDS + timeout)) value

    while (( SECONDS < deadline )); do
        value=$(api_get "$path" | jq -r "$filter" 2>/dev/null)
        if [[ -n "$value" && "$value" != "null" ]]; then
            echo "$value"
            return 0
        fi
        sleep 3
    done

    echo "timed out after ${timeout}s waiting for $filter at $path" >&2
    return 1
}
