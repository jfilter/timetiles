#!/bin/bash
# TimeTiles Bootstrap - Step 13: Scraper Runner Setup (Optional)
# Installs Podman, pulls base images, and configures the TimeScrape runner
# as a systemd service. Skipped by default — set SKIP_SCRAPER=false to enable.

# Rootless Podman can wedge instead of failing: it blocks in a futex wait
# after opening its sqlite backend and never returns, turning any invocation
# into a silent bootstrap hang. Observed here at 47 minutes with no output,
# with the run otherwise healthy — so the cap below is the load-bearing part.
# Every call goes through podman_as, which bounds the call and pins
# XDG_RUNTIME_DIR, since sudo does not carry it over.
#
# The timeout is what guarantees the bootstrap makes progress. The runtime dir
# handling in configure_rootless is hardening around the same area, not a
# proven cure — the underlying wedge was not fully root-caused.
# Podman's runtime state (runroot), and the reason the runner could never start
# a container: the unit paired this with ProtectHome=yes, which mounts an empty
# read-only tmpfs over /run/user just as it does over /home and /root. Verified
# inside the running service's namespace -- /run/user was mode d--------- and
# empty. Podman fell back to $HOME/rundir, read-only under ProtectSystem=strict,
# and every run died with
#   mkdir /opt/timetiles-src/deployment/rundir/libpod: no such file or directory
# while systemctl reported the unit active.
#
# The fix is to expose this path to the unit (ProtectHome=tmpfs + BindPaths),
# not to move podman somewhere logind-independent. That was tried: a runroot
# under /run created by tmpfiles works for starting containers but loses the
# systemd user session, and rootless podman needs that session's cgroup
# delegation to apply a limit. `podman run --memory 512m` -- which the runner
# always passes -- then fails with
#   rootless needs no limits + no cgrouppath when no permission is granted
# Delegate=yes on the unit does not help; podman still resolves its cgroup
# under system.slice rather than the delegated subtree. So logind is not
# avoidable here, only orderable: lingering below, plus After=user@$uid.
runtime_dir_for() {
    echo "/run/user/$(id -u "$1")"
}

# Podman's image store, left at its default under the app user's home. The
# runner needs to write here -- `podman run` creates a container layer -- and
# ProtectSystem=strict makes the whole tree read-only, so the unit grants this
# one directory back through ReadWritePaths.
#
# Relocating it instead, via XDG_DATA_HOME or a storage.conf graphroot, was
# tried and reverted: it splits podman's network handling. `network create` and
# `network ls` follow the moved graphroot while `podman run --network` keeps
# looking at the default, so a network created seconds earlier comes back as
#   unable to find network with name or ID scraper-sandbox: network not found
# Reproduced with a freshly created network, and confirmed against a control run
# on the default graphroot, which works. Keeping the store where podman expects
# it is the cheaper half of the trade: the directory is gitignored, so the only
# real objection to its location was tidiness.
SCRAPER_IMAGE_STORE_SUBDIR=".local/share/containers"

# Work area for scraper checkouts and outputs. Under /tmp, which is cleared on
# reboot, so it is recreated by the same tmpfiles.d entry -- it appears in
# ReadWritePaths without a leading dash, so a missing one keeps the unit from
# starting at all.
SCRAPER_WORK_DIR="/tmp/timescrape"

# Usage: podman_as <user> <timeout-seconds> <podman args...>
podman_as() {
    local user="$1"
    local timeout_s="$2"
    shift 2

    # Same runroot and graphroot the service uses. If these differed, the images
    # pulled here would land somewhere the runner cannot see and every run would
    # fail with "image not known" after a bootstrap that reported success.
    timeout "$timeout_s" sudo -u "$user" \
        env "XDG_RUNTIME_DIR=$(runtime_dir_for "$user")" \
            podman "$@"
}

run_step() {
    if [[ "${SKIP_SCRAPER:-true}" == "true" ]]; then
        print_skip "Scraper setup skipped (SKIP_SCRAPER=true)"
        return 0
    fi

    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local user="${APP_USER:-timetiles}"
    local version="${TIMETILES_VERSION:-latest}"

    install_nodejs
    install_podman
    configure_rootless "$user"
    pull_base_images "$user" "$version"
    create_sandbox_network "$user"
    install_runner "$install_dir" "$user" "$version"
    create_runner_systemd_service "$install_dir" "$user"
    allow_runner_ingress "$install_dir"
    enable_scraper_url "$install_dir" "$user"
    start_runner
    verify_runner_health "$install_dir" "$user"

    print_success "Scraper runner setup complete"
}

install_nodejs() {
    if command -v node &>/dev/null; then
        local node_version
        node_version=$(node --version)
        print_info "Node.js already installed: $node_version"
        return 0
    fi

    print_step "Installing Node.js..."

    # Add NodeSource GPG key and repository (no pipe-to-bash)
    mkdir -p /etc/apt/keyrings
    curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
    echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
    apt-get update -qq
    apt-get install -y nodejs

    print_success "Node.js installed: $(node --version)"
}

install_podman() {
    if command -v podman &>/dev/null; then
        print_info "Podman already installed: $(podman --version)"
        return 0
    fi

    print_step "Installing Podman..."

    apt-get update -qq
    apt-get install -y podman slirp4netns uidmap

    print_success "Podman installed: $(podman --version)"
}

configure_rootless() {
    local user="$1"

    print_step "Configuring rootless Podman for $user..."

    # Ensure sub-UID/sub-GID ranges exist for the user
    if ! grep -q "^${user}:" /etc/subuid 2>/dev/null; then
        usermod --add-subuids 100000-165535 "$user"
        print_info "Added sub-UID range for $user"
    fi

    if ! grep -q "^${user}:" /etc/subgid 2>/dev/null; then
        usermod --add-subgids 100000-165535 "$user"
        print_info "Added sub-GID range for $user"
    fi

    # Lingering starts user@$uid.service at boot, which is what creates
    # /run/user/$uid and — the part that actually matters — gives rootless podman
    # a systemd user session to delegate cgroups through. Without that session
    # podman falls back to --cgroup-manager=cgroupfs and every `podman run` that
    # carries a limit fails; the runner always passes --memory, so the feature is
    # dead without this. A failure here is reported rather than swallowed: a
    # wedged logind answers "Could not enable linger: Connection timed out", and
    # the consequences surface much later as unexplained container errors.
    if loginctl enable-linger "$user" 2>/dev/null; then
        print_info "Enabled lingering for $user"
    else
        print_warning "Could not enable lingering for $user (logind unavailable)"
        print_warning "  Rootless podman will lose cgroup delegation and reject --memory limits"
    fi

    # The directories podman and the runner write to, recreated at every boot.
    # The work dir is under /tmp, which is cleared on reboot, and it appears in
    # the unit's ReadWritePaths without a leading dash — a dash would let the
    # unit start and then fail to write, which is exactly how the runtime-dir
    # bug stayed hidden. /run/user/$uid is deliberately NOT listed here: it
    # belongs to logind, and the unit orders itself after user@$uid instead.
    cat > /etc/tmpfiles.d/timetiles-scraper.conf << EOF
# Work area for the TimeScrape runner, recreated after /tmp is cleared.
d $SCRAPER_WORK_DIR 0700 $user $user -
EOF
    systemd-tmpfiles --create /etc/tmpfiles.d/timetiles-scraper.conf
    print_info "Created scraper work directory"

    # The image store is a plain directory under the user's home, but it has to
    # exist before the unit starts: it is a ReadWritePath without a leading dash,
    # so systemd refuses to start the service if it is missing. Podman would
    # create it on first pull, which happens later in this step.
    install -d -o "$user" -g "$user" -m 700 "$install_dir/$SCRAPER_IMAGE_STORE_SUBDIR"

    # Verify rootless Podman works
    if podman_as "$user" 60 info --format '{{.Host.Security.Rootless}}' 2>/dev/null | grep -q "true"; then
        print_success "Rootless Podman configured for $user"
    else
        print_warning "Could not verify rootless Podman (may work after re-login)"
    fi
}

pull_base_images() {
    local user="$1"
    local version="$2"
    # App sources live in the -src working tree, not under the install dir:
    # $INSTALL_DIR is a symlink to ${INSTALL_DIR}-src/deployment, so
    # "$INSTALL_DIR/apps" would resolve to deployment/apps, which never exists.
    local src_dir="${INSTALL_DIR:-/opt/timetiles}-src"

    local python_image="${SCRAPER_PYTHON_IMAGE:-ghcr.io/jfilter/timetiles-scraper-python:$version}"
    local node_image="${SCRAPER_NODE_IMAGE:-ghcr.io/jfilter/timetiles-scraper-node:$version}"

    # Try pulling from GHCR first, fall back to local build
    print_step "Setting up scraper base images..."

    if podman_as "$user" 900 pull "$python_image" 2>/dev/null; then
        podman_as "$user" 60 tag "$python_image" timescrape-python
        print_success "Pulled timescrape-python from registry"
    elif [[ -f "$src_dir/apps/timescrape/images/python/Dockerfile" ]]; then
        print_info "Registry pull failed, building timescrape-python locally..."
        podman_as "$user" 1800 build -t timescrape-python "$src_dir/apps/timescrape/images/python/"
        print_success "Built timescrape-python locally"
    else
        die "Cannot pull or build timescrape-python image"
    fi

    if podman_as "$user" 900 pull "$node_image" 2>/dev/null; then
        podman_as "$user" 60 tag "$node_image" timescrape-node
        print_success "Pulled timescrape-node from registry"
    elif [[ -f "$src_dir/apps/timescrape/images/node/Dockerfile" ]]; then
        print_info "Registry pull failed, building timescrape-node locally..."
        podman_as "$user" 1800 build -t timescrape-node "$src_dir/apps/timescrape/images/node/"
        print_success "Built timescrape-node locally"
    else
        die "Cannot pull or build timescrape-node image"
    fi
}

# Subnet for the sandbox network.
#
# Pinned rather than left to podman's allocator because the egress rules below
# have to name it. Inside podman's own default pool (10.89.0.0/16), so it does
# not collide with anything the host's LAN is likely to use.
SCRAPER_SANDBOX_SUBNET="10.89.200.0/24"

# Destinations a scraper must never reach, whatever else it may reach.
#
# The scraper's own subnet is not listed: traffic inside it is bridged, not
# routed, so these FORWARD rules never see it.
SCRAPER_BLOCKED_DESTINATIONS=(
    "10.0.0.0/8"      # RFC1918 class A — other hosts on the operator's network
    "172.16.0.0/12"   # RFC1918 class B — includes docker's default pool
    "192.168.0.0/16"  # RFC1918 class C
    "169.254.0.0/16"  # link-local, incl. the cloud metadata service
    "127.0.0.0/8"     # loopback
)

# Create the sandbox network: reachable internet, unreachable neighbours.
#
# NOT `--internal`, despite what this used to do. podman's `--internal` removes
# the external gateway entirely, so a container on the network can reach
# nothing at all — the scraper feature cannot scrape. ADR 0015 asks for the
# other shape: "internet access but cannot reach internal services". That is a
# normal NAT network plus egress filtering, which is what this builds.
#
# Containment therefore lives in the firewall, not in the network driver. The
# host itself is covered separately: container-to-host traffic lands in INPUT,
# where step 03's `default deny incoming` already governs it.
create_sandbox_network() {
    local user="$1"

    print_step "Creating scraper sandbox network..."

    if podman_as "$user" 60 network ls --format '{{.Name}}' | grep -q "^scraper-sandbox$"; then
        print_info "Scraper sandbox network already exists"
    else
        podman_as "$user" 120 network create --subnet "$SCRAPER_SANDBOX_SUBNET" scraper-sandbox \
            || die "Failed to create the scraper-sandbox network"
        print_success "Created Podman network: scraper-sandbox ($SCRAPER_SANDBOX_SUBNET)"
    fi

    apply_sandbox_egress_rules
}

# Fence the sandbox subnet off from every private destination.
#
# Applied on every run, not only when the network is created: a host whose
# network already exists from an earlier bootstrap still needs the rules, and
# ufw deduplicates identical rules itself.
#
# Order matters — ufw evaluates route rules top-down and takes the first match,
# so every deny has to be inserted before the catch-all allow.
apply_sandbox_egress_rules() {
    if ! command -v ufw &>/dev/null; then
        print_warning "ufw not installed — scraper egress is UNFILTERED"
        print_warning "  A scraper can reach every host the server can reach"
        return 0
    fi

    print_step "Restricting scraper egress to public destinations..."

    local destination
    for destination in "${SCRAPER_BLOCKED_DESTINATIONS[@]}"; do
        ufw route deny from "$SCRAPER_SANDBOX_SUBNET" to "$destination" >/dev/null \
            || die "Failed to add egress deny rule for $destination"
    done

    ufw route allow from "$SCRAPER_SANDBOX_SUBNET" >/dev/null \
        || die "Failed to add the scraper egress allow rule"

    print_success "Scraper egress restricted (public internet only)"
}

# Port the runner's HTTP API listens on. Matches SCRAPER_RUNNER_URL below and
# apps/timescrape's SCRAPER_PORT default.
SCRAPER_RUNNER_PORT=4000

# Must match the default in docker-compose.prod.yml's timetiles-network ipam
# block. Only used when .env.production carries no DOCKER_NETWORK_SUBNET, which
# is the case for a host bootstrapped before that key existed.
DEFAULT_DOCKER_NETWORK_SUBNET="172.16.238.0/24"

# Let the compose containers reach the runner on the host.
#
# The runner is a host-native systemd service, not a container: worker-ingest
# calls it at http://host.docker.internal:4000. Traffic from a container to a
# host address is delivered locally, so it traverses the host's INPUT chain --
# NOT the FORWARD chain docker manages. Step 03 sets `ufw default deny
# incoming` and opens only 22/80/443, so without a rule here every scraper run
# fails to reach the runner, while the runner's own loopback health check
# passes and reports it fine.
#
# Scoped to the compose subnet and that one port, so this does not publish the
# runner to the host's LAN: any other source address is still governed by the
# default deny. That is also why the subnet is pinned in the compose file
# rather than auto-allocated -- see the note on timetiles-network there.
allow_runner_ingress() {
    local install_dir="$1"
    local env_file="$install_dir/.env.production"
    local subnet

    if ! command -v ufw &>/dev/null; then
        print_info "ufw not installed — no ingress rule needed for the runner"
        return 0
    fi

    subnet="$(sed -n 's/^DOCKER_NETWORK_SUBNET=//p' "$env_file" 2>/dev/null | tail -1)"
    subnet="${subnet:-$DEFAULT_DOCKER_NETWORK_SUBNET}"

    print_step "Allowing the compose network to reach the runner..."

    ufw allow from "$subnet" to any port "$SCRAPER_RUNNER_PORT" proto tcp >/dev/null \
        || die "Failed to allow $subnet to reach the runner on port $SCRAPER_RUNNER_PORT"

    print_success "Runner reachable from $subnet on port $SCRAPER_RUNNER_PORT"
}

# Explain the sparse-checkout dead end instead of letting `turbo prune` fail.
die_incomplete_monorepo() {
    local src_dir="$1"
    local why="$2"

    print_error "Cannot build the scraper runner from source: $src_dir is not a full checkout"
    print_info "$why, and the local build is the only path left."
    print_info "The runner's Dockerfile runs 'turbo prune', which needs the monorepo root"
    print_info "(package.json, pnpm-workspace.yaml, turbo.json) and packages/. Step 05"
    print_info "sparse-checks-out only deployment/, apps/web/config/ and apps/timescrape/."
    print_info ""
    print_info "Either make the registry reachable (this is the supported path), or replace"
    print_info "$src_dir with a full clone:"
    print_info "  git -C $src_dir sparse-checkout disable && git -C $src_dir checkout -- ."
    die "Incomplete build context for the scraper runner"
}

install_runner() {
    local install_dir="$1"
    local user="$2"
    local version="$3"
    local runner_dir="$install_dir/scraper-runner"
    # See pull_base_images: app sources live in the -src tree, not under $install_dir.
    local src_dir="${install_dir}-src"

    print_step "Installing scraper runner..."

    mkdir -p "$runner_dir"

    # Clean previous installation
    rm -rf "${runner_dir:?}/dist" "${runner_dir:?}/node_modules" "${runner_dir:?}/package.json"

    # Strategy 1: Extract pre-built runner from GHCR Docker image (no build tools needed)
    local image="${SCRAPER_IMAGE:-ghcr.io/jfilter/timetiles-timescrape}:$version"

    # Helper: extract /app from a Docker image into runner_dir using tar (resolves symlinks)
    extract_from_image() {
        local img="$1"
        docker rm -f tt-scraper-extract 2>/dev/null || true
        docker create --name tt-scraper-extract "$img"
        # Use tar to extract — docker cp preserves symlinks which break outside the container
        if ! docker export tt-scraper-extract | tar -xf - -C "$runner_dir" --strip-components=1 app/dist app/node_modules app/package.json; then
            docker rm -f tt-scraper-extract 2>/dev/null || true
            die "Failed to extract runner from image $img"
        fi
        docker rm tt-scraper-extract

        # Verify extraction
        if [[ ! -f "$runner_dir/dist/index.js" ]]; then
            die "Runner extraction failed — dist/index.js not found"
        fi
    }

    # Refuse a local build the context cannot support, before spending a
    # monorepo build on it.
    #
    # apps/timescrape/Dockerfile starts with `turbo prune timescrape --docker`,
    # which needs the monorepo ROOT (package.json, pnpm-workspace.yaml,
    # pnpm-lock.yaml, turbo.json) plus the workspace packages timescrape
    # depends on -- it takes workspace:* deps on @timetiles/eslint-config and
    # @timetiles/typescript-config. A bootstrapped host has none of that:
    # step 05 sparse-checks-out only deployment/, apps/web/config/ and
    # apps/timescrape/, so `docker build "$src_dir"` sends a context with an
    # app and no workspace around it and prune fails deep inside the build
    # with an error that says nothing about sparse checkout.
    #
    # A full checkout (the VM harness rsyncs one to /opt/timetiles-src) passes
    # this check and builds normally. Widening the sparse checkout was the
    # alternative and was rejected: it would have to track which packages
    # timescrape's dependency graph pulls in and stay correct as that changes,
    # to rescue a path that only runs when the registry is unreachable.
    local build_context_ok=false
    if [[ -f "$src_dir/apps/timescrape/Dockerfile" ]] \
        && [[ -f "$src_dir/pnpm-workspace.yaml" ]] \
        && [[ -f "$src_dir/package.json" ]] \
        && [[ -f "$src_dir/turbo.json" ]]; then
        build_context_ok=true
    fi

    # SCRAPER_LOCAL_BUILD forces strategy 2. Without it the registry pull always
    # wins, so a checkout's runner source is never what gets installed -- which
    # made the VM harness verify published runner code against working-tree
    # deployment code, and let a packaging bug in this app's Dockerfile survive a
    # green run. Strategy 1 stays the default: a normal host has no reason to
    # spend a monorepo build on something it can pull.
    if [[ "${SCRAPER_LOCAL_BUILD:-false}" == "true" ]]; then
        if [[ "$build_context_ok" != "true" ]]; then
            die_incomplete_monorepo "$src_dir" "SCRAPER_LOCAL_BUILD=true was requested"
        fi
        print_info "SCRAPER_LOCAL_BUILD set — building runner from $src_dir"
        if ! docker build -t timescrape-runner-local \
            -f "$src_dir/apps/timescrape/Dockerfile" "$src_dir"; then
            die "Failed to build scraper runner image from source"
        fi
        extract_from_image timescrape-runner-local
        print_success "Built runner from source"
    elif docker pull "$image" 2>/dev/null; then
        print_info "Extracting runner from image: $image"
        extract_from_image "$image"
    # Strategy 2: Build via Docker and extract (same as strategy 1, but build locally)
    # Needs repo root as context for turbo prune (monorepo workspace resolution)
    elif [[ "$build_context_ok" == "true" ]]; then
        print_info "Registry pull failed, building runner image locally..."
        # Build context is the repo root, not the app dir: the Dockerfile runs
        # turbo prune and needs the monorepo workspace to resolve.
        if ! docker build -t timescrape-runner-local \
            -f "$src_dir/apps/timescrape/Dockerfile" "$src_dir"; then
            die "Failed to build scraper runner image"
        fi
        extract_from_image timescrape-runner-local
        print_success "Built runner locally"
    elif [[ -f "$src_dir/apps/timescrape/Dockerfile" ]]; then
        die_incomplete_monorepo "$src_dir" "pulling $image failed"
    else
        die "Cannot pull or build scraper runner"
    fi

    chown -R "$user:$user" "$runner_dir"

    print_success "Runner installed to $runner_dir"
}

enable_scraper_url() {
    local install_dir="$1"
    local user="$2"
    local env_file="$install_dir/.env.production"

    print_step "Enabling SCRAPER_RUNNER_URL in .env.production..."

    # Set SCRAPER_RUNNER_URL now that the runner is about to start.
    # This was deferred from step 06 to avoid the web app health check
    # returning 503 during step 07 (before the runner is installed).
    local runner_url="http://host.docker.internal:${SCRAPER_RUNNER_PORT}"
    if grep -q "^SCRAPER_RUNNER_URL=" "$env_file" 2>/dev/null; then
        sed -i "s|^SCRAPER_RUNNER_URL=.*|SCRAPER_RUNNER_URL=$runner_url|" "$env_file"
    else
        echo "SCRAPER_RUNNER_URL=$runner_url" >> "$env_file"
    fi

    # Restart the whole stack so the new env var reaches every service.
    #
    # Not just web, despite what this used to say: worker-ingest is the process
    # that actually calls the runner (the scraper runs as the `scraper-ingest`
    # workflow on the "ingest" queue), and web only reads the value to report
    # runner health. Naming one container here sent anyone debugging a failed
    # scraper run to the wrong logs.
    #
    # Writing the file is not the same as applying it: a running container keeps
    # the environment it started with. If the restart fails, the worker never
    # learns the runner exists and every scraper run reports "not configured" —
    # while the runner itself starts fine and its health check passes, so
    # nothing downstream contradicts a success message here. Fail loudly and
    # keep the restart output, which is the only place the reason appears.
    if ! command -v docker &>/dev/null; then
        die "docker not found — cannot apply SCRAPER_RUNNER_URL to the running services"
    fi

    print_info "Restarting services to pick up SCRAPER_RUNNER_URL..."
    local restart_output
    if ! restart_output=$(sudo -u "$user" sg docker -c "cd $install_dir && ./timetiles restart" 2>&1); then
        print_error "Failed to restart the services"
        echo "$restart_output" >&2
        print_info "SCRAPER_RUNNER_URL is set in $env_file but the running services have not picked it up"
        print_info "Fix the stack, then run: cd $install_dir && ./timetiles restart"
        die "Could not apply SCRAPER_RUNNER_URL to the running services"
    fi

    print_success "SCRAPER_RUNNER_URL enabled"
}

create_runner_systemd_service() {
    local install_dir="$1"
    local user="$2"

    print_step "Creating systemd service for scraper runner..."

    cat > /etc/systemd/system/timescrape-runner.service << EOF
[Unit]
Description=TimeScrape Runner
Documentation=https://github.com/jfilter/timetiles/blob/main/apps/timescrape/docs/SETUP.md
# user@$(id -u "$user").service is logind's per-user manager, started at boot
# because lingering is enabled. It owns /run/user/$(id -u "$user"), which this
# unit binds in below and which rootless podman needs for cgroup delegation.
# Without the ordering the bind mount can be set up before the directory exists
# and the unit fails to start — loudly, which is the point.
After=network-online.target timetiles.service user@$(id -u "$user").service
Wants=network-online.target user@$(id -u "$user").service

[Service]
Type=simple
User=$user
Group=$user
WorkingDirectory=$install_dir/scraper-runner
# The runtime dir comes from logind (see After= above). The image store keeps
# podman's default location under this user's home and is granted back through
# ReadWritePaths below; moving it breaks network lookup, see the note at the top.
Environment=XDG_RUNTIME_DIR=$(runtime_dir_for "$user")
EnvironmentFile=$install_dir/.env.production
ExecStart=/usr/bin/node $install_dir/scraper-runner/dist/index.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=timescrape-runner

# Security hardening
NoNewPrivileges=yes
ProtectSystem=strict
# No leading dashes. A dash makes systemd skip a missing path, and under
# ProtectSystem=strict the result is a unit that starts and then cannot write
# where podman needs to -- which is how every scraper run came to fail while
# systemctl reported the service active and healthy. Without the dash a missing
# directory stops the unit, which is the failure anyone would actually notice.
ReadWritePaths=$SCRAPER_WORK_DIR $install_dir/scraper-runner /var/log/timetiles $(runtime_dir_for "$user") $install_dir/$SCRAPER_IMAGE_STORE_SUBDIR
# tmpfs rather than yes, plus an explicit bind of the runtime dir. ProtectHome=yes
# covers /home, /root AND /run/user, and hiding the last one is what left podman
# with no usable runroot and no cgroup delegation. tmpfs keeps /home and /root
# just as inaccessible while BindPaths puts back the one directory podman needs.
ProtectHome=tmpfs
BindPaths=$(runtime_dir_for "$user")
PrivateTmp=no

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable timescrape-runner.service

    # Allow the deploy user to restart the runner without a password so
    # `timetiles update` can do it non-interactively. Scoped to this one
    # unit + a couple of inspection commands.
    local sudoers_file="/etc/sudoers.d/timetiles-timescrape-runner"
    cat > "$sudoers_file" <<EOF
$user ALL=(root) NOPASSWD: /bin/systemctl restart timescrape-runner.service, /bin/systemctl restart timescrape-runner, /bin/systemctl status timescrape-runner.service, /bin/systemctl is-active timescrape-runner.service
EOF
    chmod 440 "$sudoers_file"
    visudo -c -f "$sudoers_file" >/dev/null || die "Generated sudoers file is invalid: $sudoers_file"

    print_success "Systemd service created: timescrape-runner"
}

start_runner() {
    local user="${APP_USER:-timetiles}"

    print_step "Starting scraper runner..."

    # Re-apply rather than mkdir: the tmpfiles entry is the single definition of
    # these directories and their ownership, and it is also what recreates them
    # after a reboot. Running it again here keeps this step idempotent on its own.
    # `|| true` on both: systemd-tmpfiles reports partial failures that the
    # is-active check below judges far better, and a failed `start` must reach
    # that check too — it is what dumps the journal and explains what happened.
    # Letting errexit abort here would replace that diagnosis with a bare exit
    # code.
    systemd-tmpfiles --create /etc/tmpfiles.d/timetiles-scraper.conf || true

    systemctl start timescrape-runner.service || true

    # Give it a moment to start
    sleep 3

    if systemctl is-active --quiet timescrape-runner.service; then
        print_success "Scraper runner started"
    else
        print_error "Scraper runner failed to start"
        journalctl -u timescrape-runner --no-pager -n 20
        die "Scraper runner startup failed"
    fi
}

verify_runner_health() {
    local install_dir="$1"
    local user="$2"

    print_step "Verifying scraper runner health..."

    if ! wait_for_health "http://localhost:${SCRAPER_RUNNER_PORT}/health" 30 5; then
        print_error "Scraper runner health check failed"
        journalctl -u timescrape-runner --no-pager -n 20
        die "Scraper runner health check failed"
    fi

    print_success "Scraper runner is healthy on the host"

    verify_runner_reachable_from_worker "$install_dir" "$user"
}

# Probe the runner from inside worker-ingest, not just over loopback.
#
# The loopback check above proves the process is serving; it says nothing about
# the path that actually carries scraper runs. Those originate in the
# worker-ingest container and cross the docker bridge into the host's INPUT
# chain, where the firewall governs them. A loopback-only check passed happily
# on a host where every single scraper run failed with a connection timeout,
# which is exactly the gap allow_runner_ingress closes -- so verify the closed
# gap here rather than trusting it.
#
# wget is BusyBox's, from the node:*-alpine base the app image uses.
verify_runner_reachable_from_worker() {
    local install_dir="$1"
    local user="$2"
    local env_file="$install_dir/.env.production"
    local project container

    if ! command -v docker &>/dev/null; then
        print_warning "docker not found — skipping the container-side runner probe"
        return 0
    fi

    project="$(sed -n 's/^COMPOSE_PROJECT_NAME=//p' "$env_file" 2>/dev/null | tail -1)"
    container="${project:-timetiles}-worker-ingest"

    print_step "Verifying the runner is reachable from $container..."

    if sudo -u "$user" sg docker -c \
        "docker exec $container wget -q -T 5 -O /dev/null http://host.docker.internal:${SCRAPER_RUNNER_PORT}/health"; then
        print_success "Runner reachable from $container"
        return 0
    fi

    print_error "$container cannot reach the runner at host.docker.internal:${SCRAPER_RUNNER_PORT}"
    print_info "The runner answers on the host, so this is the container -> host path."
    print_info "Check the firewall: ufw status | grep ${SCRAPER_RUNNER_PORT}"
    print_info "Every scraper run will fail until this succeeds."
    die "Scraper runner unreachable from the ingest worker"
}
