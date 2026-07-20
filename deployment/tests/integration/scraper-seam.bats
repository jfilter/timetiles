#!/usr/bin/env bats
# Integration test for the seam between the web app and the scraper runner.
#
# Two halves of this pipeline were already covered and the join between them was
# not. The web e2e test is API-only and says so in its own header -- it accepts
# 200 or 409 from the trigger and never checks whether anything ran.
# scraper-runtime.bats drives Podman directly, proving the container side works
# in isolation. Neither exercises the path that actually carries a run:
#
#   POST /api/scrapers/:id/run  ->  Payload queue  ->  worker-ingest
#     ->  callRunner()  ->  runner  ->  real container  ->  RunnerResponse
#     ->  scraper-runs record
#
# That path is where this session's three production bugs lived, and it only
# exists in a full deployment: the trigger runs in the web container while the
# runner call is made from worker-ingest, so URL, API key and host networking
# all have to line up there rather than where the request arrived.
#
# Scope stops at the persisted run. autoImport stays off (its default), so the
# workflow returns early without an ingest file and the import pipeline is not
# on trial here -- asserting on Events would mean schema detection, review gates
# and geocoding could all fail this test without the seam being at fault.

# Record why the fixture could not be built.
#
# The distinction is load-bearing: a host that never got a scraper deployment
# has nothing to say about the seam and should skip, but once the capability is
# there, anything that goes wrong while provisioning is a real failure. Turning
# both into a skip would let this file report green without ever running a
# scraper -- exactly the blindness it was written to remove.
_fixture_skip() { echo "$1" > "$BATS_FILE_TMPDIR/skip_reason"; }
_fixture_fail() { echo "$1" > "$BATS_FILE_TMPDIR/fixture_error"; }

setup_file() {
    load '../helpers/api.bash'
    load '../helpers/podman.bash'

    # Provisioning lives here rather than in each test so the run is triggered
    # exactly once; the tests below are assertions about that single run.
    command -v podman &>/dev/null || { _fixture_skip "Podman is not installed"; return 0; }
    systemctl cat timescrape-runner.service &>/dev/null \
        || { _fixture_skip "Scraper runner not deployed on this host"; return 0; }
    _api_curl -f "$API_BASE/api/health" >/dev/null 2>&1 \
        || { _fixture_skip "Web app is not reachable at $API_BASE"; return 0; }

    api_login || { _fixture_fail "could not obtain an admin session: ${API_LOGIN_ERROR:-no detail}"; return 0; }

    # Enable the scrapers feature flag, preserving the rest of the global.
    local settings
    settings=$(api_get "/api/globals/settings")
    api_post "/api/globals/settings" \
        "$(jq -c '.featureFlags.enableScrapers = true' <<<"$settings")" >/dev/null

    # A Node scraper with no imports beyond the standard library: no network,
    # which matters because the sandbox network is --internal, and no git
    # checkout, which keeps the fixture free of DNS and credentials. Node rather
    # than Python so this also covers the base image whose user was broken.
    local manifest scraper_js code repo_id
    manifest=$(printf '%s\n' \
        "scrapers:" \
        "  - name: Seam Test Scraper" \
        "    slug: seam-test-scraper" \
        "    runtime: node" \
        "    entrypoint: scraper.js" \
        "    output: data.csv")
    scraper_js=$(printf '%s\n' \
        "const fs = require('fs');" \
        "fs.writeFileSync('/output/data.csv', 'title,date\\nSeam Test Event,2026-01-01\\n');" \
        "console.log('SEAM_SENTINEL_OK');")

    code=$(jq -nc --arg m "$manifest" --arg s "$scraper_js" \
        '{"scrapers.yml": $m, "scraper.js": $s}')

    # The feature-flag service caches for a minute, so repo creation can be
    # rejected until that expires. Retry rather than sleep through it blindly.
    local attempt create_body
    for attempt in $(seq 1 15); do
        create_body=$(api_post "/api/scraper-repos" \
            "$(jq -nc --arg n "Seam Test Repo $$" --argjson c "$code" \
                '{name: $n, sourceType: "upload", code: $c}')")
        repo_id=$(jq -r '.doc.id // empty' <<<"$create_body")
        [[ -n "$repo_id" ]] && break
        sleep 5
    done
    [[ -n "$repo_id" ]] || { _fixture_fail "scraper-repo creation failed: $create_body"; return 0; }

    # The afterChange hook queues a sync job that turns the manifest into
    # scrapers; without it there is nothing to trigger.
    api_poll_until "/api/scraper-repos/$repo_id" \
        'select(.lastSyncStatus == "success") | .lastSyncStatus' 90 >/dev/null || { _fixture_fail "repo sync never reached success"; return 0; }

    local scraper_id
    scraper_id=$(api_get "/api/scrapers?where[repo][equals]=$repo_id" | jq -r '.docs[0].id // empty')
    [[ -n "$scraper_id" ]] || { _fixture_fail "manifest produced no scraper"; return 0; }

    # Trigger once and record the status; the first assertion below reads it.
    local trigger_status
    trigger_status=$(api_post_status "/api/scrapers/$scraper_id/run" '{}')

    # Wait for a terminal run. Bounded, because the failure this guards against
    # is a run that never leaves "running".
    local run_json
    api_poll_until "/api/scraper-runs?where[scraper][equals]=$scraper_id&sort=-createdAt&limit=1" \
        'select(.docs[0].status != "running" and .docs[0].status != null) | .docs[0].status' 180 >/dev/null || true
    run_json=$(api_get "/api/scraper-runs?where[scraper][equals]=$scraper_id&sort=-createdAt&limit=1")

    # Hand state to the tests; bats gives each test its own shell.
    echo "$trigger_status" > "$BATS_FILE_TMPDIR/trigger_status"
    echo "$scraper_id" > "$BATS_FILE_TMPDIR/scraper_id"
    echo "$run_json" > "$BATS_FILE_TMPDIR/run.json"
    echo "$repo_id" > "$BATS_FILE_TMPDIR/repo_id"
}

teardown_file() {
    load '../helpers/api.bash'
    [[ -f "$BATS_FILE_TMPDIR/repo_id" ]] || return 0
    api_login || return 0
    # Deleting the repo cascades to its scrapers; leaving them behind would make
    # a rerun on the same VM pick up the wrong scraper.
    _api_curl -X DELETE -H "Authorization: JWT $API_TOKEN" \
        "$API_BASE/api/scraper-repos/$(cat "$BATS_FILE_TMPDIR/repo_id")" >/dev/null 2>&1 || true
}

setup() {
    load '../helpers/api.bash'
    load '../helpers/podman.bash'

    if [[ -f "$BATS_FILE_TMPDIR/skip_reason" ]]; then
        skip "$(cat "$BATS_FILE_TMPDIR/skip_reason")"
    fi
    if [[ -f "$BATS_FILE_TMPDIR/fixture_error" ]]; then
        # Deliberately a failure, not a skip: the deployment is there, so
        # something in the seam itself broke before the run could start.
        echo "fixture provisioning failed: $(cat "$BATS_FILE_TMPDIR/fixture_error")" >&2
        return 1
    fi
    [[ -f "$BATS_FILE_TMPDIR/run.json" ]] || {
        echo "fixture produced no run record and reported no reason" >&2
        return 1
    }
}

@test "triggering a run is accepted" {
    # Only 200. The web e2e test tolerates 409 because it cannot tell a
    # already-running scraper from a fresh one; here the scraper is created by
    # this file and has never run, so 409 would mean something is wrong.
    [ "$(cat "$BATS_FILE_TMPDIR/trigger_status")" = "200" ]
}

@test "the run reaches a terminal state and succeeds" {
    local status
    status=$(jq -r '.docs[0].status' < "$BATS_FILE_TMPDIR/run.json")

    # "running" here means the job never came back: either worker-ingest did not
    # pick it up, or the container hung. Both are seam failures.
    [ "$status" != "running" ]
    [ "$status" = "success" ]
}

@test "the container ran and exited cleanly" {
    [ "$(jq -r '.docs[0].exitCode' < "$BATS_FILE_TMPDIR/run.json")" = "0" ]
}

@test "the scraper's output was written to the mount and read back" {
    # One data row proves the whole output path: the container could write into
    # the bind mount, and the runner could read, validate and count it. This is
    # the assertion the unwritable-output bug would have failed.
    [ "$(jq -r '.docs[0].outputRows' < "$BATS_FILE_TMPDIR/run.json")" = "1" ]
    [ "$(jq -r '.docs[0].outputBytes' < "$BATS_FILE_TMPDIR/run.json")" -gt 0 ]
}

@test "the run's stdout came back through the runner response" {
    # A language-specific sentinel: it can only appear if the Node image started
    # and executed the entrypoint, which the broken image user would have
    # prevented.
    jq -r '.docs[0].stdout' < "$BATS_FILE_TMPDIR/run.json" | grep -q "SEAM_SENTINEL_OK"
}
