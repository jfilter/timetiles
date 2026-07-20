#!/usr/bin/env bats
# Integration tests for the scraper container runtime
#
# These close a gap that let a broken deployment report success: step 13's
# health check only asks whether the runner answers on its port, and that
# endpoint returns a static payload without touching Podman. A deployment
# where rootless Podman cannot start a single container passed it cleanly.
#
# So these tests actually start containers, as the app user, the way the
# runner does.

setup() {
    load '../helpers/podman.bash'
    init_podman
}

# =============================================================================
# Rootless Podman
# =============================================================================

# The canary. A wedged Podman produces no output and no error -- it simply
# never returns -- so status 124 (timed out), not a non-zero exit, is the
# signature to look for.
@test "rootless podman responds" {
    skip_if_no_podman

    run podman_bounded info --format '{{.Host.Security.Rootless}}'
    [ "$status" -ne 124 ]
    [ "$status" -eq 0 ]
    [ "$output" = "true" ]
}

@test "rootless podman can actually run a container" {
    skip_if_no_podman
    require_scraper_image timescrape-python

    # The image runs as an unprivileged user with /bin/false as its shell,
    # so drive the interpreter directly rather than going through a shell.
    run podman_bounded run --rm timescrape-python python -c "print('ok')"
    [ "$status" -eq 0 ]
    [[ "$output" == *"ok"* ]]
}

@test "rootless podman can run the node scraper image" {
    skip_if_no_podman
    require_scraper_image timescrape-node

    run podman_bounded run --rm timescrape-node node -e "console.log('ok')"
    [ "$status" -eq 0 ]
    [[ "$output" == *"ok"* ]]
}

# =============================================================================
# Sandbox network
# =============================================================================

@test "scraper sandbox network exists and is internal" {
    skip_if_no_podman

    run podman_bounded network inspect scraper-sandbox --format '{{.Internal}}'
    [ "$status" -eq 0 ]
    # Internal is what keeps a scraper off the host network; a non-internal
    # network here would be a containment failure, not a cosmetic difference.
    [ "$output" = "true" ]
}

@test "a container runs attached to the sandbox network" {
    skip_if_no_podman
    require_scraper_image timescrape-python

    run podman_bounded run --rm --network scraper-sandbox \
        timescrape-python python -c "print('ok')"
    [ "$status" -eq 0 ]
    [[ "$output" == *"ok"* ]]
}

# =============================================================================
# Runner service
# =============================================================================

@test "scraper runner service is active" {
    skip_if_no_podman

    run systemctl is-active timescrape-runner
    [ "$status" -eq 0 ]
    [ "$output" = "active" ]
}
