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

    run podman_value info --format '{{.Host.Security.Rootless}}'
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
# Node SDK resolution
# =============================================================================

# Starting the interpreter is not the same as running a scraper. The image
# exposed its globally installed packages through NODE_PATH alone, which the
# ESM resolver ignores entirely -- so every scraper the SDK scaffolds (all of
# them use `import`) died with ERR_MODULE_NOT_FOUND before scraping anything,
# while `node -e "console.log('ok')"` above kept passing. Nothing executed a
# real scraper against the image, so the whole node runtime was broken
# unnoticed. This test does.
@test "a node scraper can import the SDK and write its output" {
    skip_if_no_podman
    require_scraper_image timescrape-node

    local code="${BATS_TEST_TMPDIR}/code"
    local out="${BATS_TEST_TMPDIR}/out"
    mkdir -p "$code" "$out"

    # `:U` chowns the output mount into the container's uid range, which needs
    # the directory's group to fall inside the rootless id mapping -- see the
    # output-mount test below for why the login group, not the effective one.
    chgrp "$(id -gn "$(id -un)")" "$out"

    # ESM, exactly as `timetiles-scraper init --runtime node` scaffolds it.
    cat > "$code/scraper.js" <<'SCRAPER'
import { output } from "@timetiles/scraper";
output.writeRow({ title: "Example Event", date: "2026-01-15" });
output.save();
console.log(`wrote ${output.rowCount} rows`);
SCRAPER

    run podman_bounded run --rm --userns=auto \
        -v="$code:/scraper:ro,Z" -v="$out:/output:rw,Z,U" \
        -e=TIMESCRAPE_OUTPUT_DIR=/output \
        timescrape-node node /scraper/scraper.js
    [ "$status" -eq 0 ]
    [[ "$output" == *"wrote 1 rows"* ]]
    [ -f "$out/data.csv" ]

    run cat "$out/data.csv"
    [ "$status" -eq 0 ]
    [[ "$output" == *"title,date"* ]]

    podman_bounded unshare rm -rf "$out"
}

# The pre-installed helper libraries have to be reachable the same way, or a
# scraper resolves the SDK and then dies on its first `import axios`.
@test "a node scraper can import the pre-installed helper libraries" {
    skip_if_no_podman
    require_scraper_image timescrape-node

    local code="${BATS_TEST_TMPDIR}/libs"
    mkdir -p "$code"

    cat > "$code/scraper.js" <<'SCRAPER'
import axios from "axios";
import * as cheerio from "cheerio";
console.log(typeof axios.get === "function" && typeof cheerio.load === "function" ? "libs ok" : "libs missing");
SCRAPER

    run podman_bounded run --rm -v="$code:/scraper:ro,Z" \
        timescrape-node node /scraper/scraper.js
    [ "$status" -eq 0 ]
    [[ "$output" == *"libs ok"* ]]
}

# =============================================================================
# Sandbox network
# =============================================================================

@test "scraper sandbox network exists and is not internal" {
    skip_if_no_podman
    skip_if_no_scraper_deployment

    run podman_value network inspect scraper-sandbox --format '{{.Internal}}'
    [ "$status" -eq 0 ]
    # This used to assert "true", which read as containment but is the opposite
    # of what the feature needs: podman's --internal strips the external
    # gateway, so a scraper on such a network can reach nothing at all. ADR 0015
    # specifies internet access without access to internal services. Egress
    # filtering delivers that, and the two tests below are what actually verify
    # it — this one only pins the network shape they depend on.
    [ "$output" = "false" ]
}

# The property the sandbox exists for, stated as two opposing facts. Asserting
# the network's flags cannot express it: the containment now lives in firewall
# rules, so only a real connection attempt proves anything.

@test "a scraper can reach the public internet" {
    skip_if_no_podman
    skip_if_no_scraper_deployment
    require_scraper_image timescrape-python

    # A TCP connect, not a DNS lookup or an HTTP fetch: it isolates reachability
    # from name resolution and from any proxy in the way.
    run podman_bounded run --rm --network scraper-sandbox timescrape-python \
        python -c "import socket; socket.create_connection(('1.1.1.1', 443), timeout=10); print('reachable')"
    [ "$status" -eq 0 ]
    [[ "$output" == *"reachable"* ]]
}

@test "a scraper cannot reach private networks" {
    skip_if_no_podman
    skip_if_no_scraper_deployment
    require_scraper_image timescrape-python

    # The cloud metadata service stands in for every internal destination: it is
    # the one address that exists on every cloud host, answers instantly when
    # reachable, and hands out credentials when it does. If the egress rules are
    # missing this connects, so a pass here is meaningful rather than incidental.
    run podman_bounded run --rm --network scraper-sandbox timescrape-python \
        python -c "import socket; socket.create_connection(('169.254.169.254', 80), timeout=5); print('LEAKED')"
    [ "$status" -ne 0 ]
    [[ "$output" != *"LEAKED"* ]]
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
