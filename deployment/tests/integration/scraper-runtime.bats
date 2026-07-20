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
    skip_if_no_scraper_deployment

    run podman_bounded network inspect scraper-sandbox --format '{{.Internal}}'
    [ "$status" -eq 0 ]
    # Internal is what keeps a scraper off the host network; a non-internal
    # network here would be a containment failure, not a cosmetic difference.
    [ "$output" = "true" ]
}

@test "a container runs attached to the sandbox network" {
    skip_if_no_podman
    skip_if_no_scraper_deployment
    require_scraper_image timescrape-python

    run podman_bounded run --rm --network scraper-sandbox \
        timescrape-python python -c "print('ok')"
    [ "$status" -eq 0 ]
    [[ "$output" == *"ok"* ]]
}

# =============================================================================
# Output mount
# =============================================================================

# The runner bind-mounts a host directory it created itself and the container
# writes its result there. Both halves have to work: the container must be able
# to write, and the runner must still be able to remove the tree afterwards.
# `:U` fixes the first by chowning the mount into the container's uid range,
# which is exactly what breaks the second -- so neither half is redundant.
@test "container can write to the output mount and the host can clean it up" {
    skip_if_no_podman
    require_scraper_image timescrape-python

    local dir="${BATS_TEST_TMPDIR}/scraper-output"
    mkdir -p "$dir"

    # Match the group the runner actually creates its directories with. The
    # suite runs under `sg docker` (the compose tests need it), so anything
    # created here lands in the docker group -- a gid outside the rootless
    # id mapping, which makes the `:U` chown fail with EPERM. The runner's
    # unit sets Group=timetiles, so use the login primary group instead of
    # the effective one.
    chgrp "$(id -gn "$(id -un)")" "$dir"

    run podman_bounded run --rm --userns=auto -v="$dir:/output:rw,Z,U" \
        timescrape-python python -c "open('/output/result.csv','w').write('a,b\n')"
    [ "$status" -eq 0 ]
    [ -f "$dir/result.csv" ]

    # The runner reads the result back through the file's mode bits...
    run cat "$dir/result.csv"
    [ "$status" -eq 0 ]

    # ...and removes the tree via `podman unshare`, since the chowned files
    # belong to a subuid it cannot unlink directly.
    run podman_bounded unshare rm -rf "$dir"
    [ "$status" -eq 0 ]
    [ ! -d "$dir" ]
}

# =============================================================================
# Runner service
# =============================================================================

@test "scraper runner service is active" {
    skip_if_no_podman
    skip_if_no_scraper_deployment

    run systemctl is-active timescrape-runner
    [ "$status" -eq 0 ]
    [ "$output" = "active" ]
}
