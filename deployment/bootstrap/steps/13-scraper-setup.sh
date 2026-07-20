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

# Podman's image store (graphroot) lives under XDG_DATA_HOME. It cannot stay at
# the default $HOME/.local/share, because the app user's home IS the install dir
# and ProtectSystem=strict leaves that read-only for the runner -- `podman run`
# needs to write a container layer there, so nothing could start. Measured on
# production: 1.7 GB of images sitting somewhere the service cannot write.
# (That location is gitignored, so it never showed up in `git status`; the
# problem is reachability, not tidiness.)
SCRAPER_DATA_HOME="/var/lib/timetiles"

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
            "XDG_DATA_HOME=$SCRAPER_DATA_HOME" \
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
    enable_scraper_url "$install_dir" "$user"
    start_runner
    verify_runner_health

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
# Work area and image store for the TimeScrape runner.
d $SCRAPER_WORK_DIR 0700 $user $user -
d $SCRAPER_DATA_HOME/containers 0700 $user $user -
EOF
    systemd-tmpfiles --create /etc/tmpfiles.d/timetiles-scraper.conf
    print_info "Created scraper work and image-store directories"

    # Hosts bootstrapped before the store moved keep their images at the old
    # default under the app user's home. They are re-pulled into the new
    # location below, so the old copy is dead weight -- on production that is
    # 1.7 GB. Not deleted automatically: it is several gigabytes under someone
    # else's home directory, and a bootstrap step is the wrong place to decide
    # that for an operator.
    local legacy_store="$install_dir/.local/share/containers"
    if [[ -d "$legacy_store" ]]; then
        print_warning "Old podman image store found at $legacy_store"
        print_info "  Images are re-pulled into $SCRAPER_DATA_HOME/containers; remove the old one with:"
        print_info "  sudo rm -rf $legacy_store"
    fi

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

create_sandbox_network() {
    local user="$1"

    print_step "Creating scraper sandbox network..."

    if podman_as "$user" 60 network ls --format '{{.Name}}' | grep -q "^scraper-sandbox$"; then
        print_info "Scraper sandbox network already exists"
        return 0
    fi

    podman_as "$user" 120 network create --internal scraper-sandbox
    print_success "Created Podman network: scraper-sandbox"
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

    if docker pull "$image" 2>/dev/null; then
        print_info "Extracting runner from image: $image"
        extract_from_image "$image"
    # Strategy 2: Build via Docker and extract (same as strategy 1, but build locally)
    # Needs repo root as context for turbo prune (monorepo workspace resolution)
    elif [[ -f "$src_dir/apps/timescrape/Dockerfile" ]]; then
        print_info "Registry pull failed, building runner image locally..."
        # Build context is the repo root, not the app dir: the Dockerfile runs
        # turbo prune and needs the monorepo workspace to resolve.
        if ! docker build -t timescrape-runner-local \
            -f "$src_dir/apps/timescrape/Dockerfile" "$src_dir"; then
            die "Failed to build scraper runner image"
        fi
        extract_from_image timescrape-runner-local
        print_success "Built runner locally"
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
    if grep -q "^SCRAPER_RUNNER_URL=" "$env_file" 2>/dev/null; then
        sed -i "s|^SCRAPER_RUNNER_URL=.*|SCRAPER_RUNNER_URL=http://host.docker.internal:4000|" "$env_file"
    else
        echo "SCRAPER_RUNNER_URL=http://host.docker.internal:4000" >> "$env_file"
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
# The runtime dir comes from logind (see After= above); the data home is created
# by /etc/tmpfiles.d/timetiles-scraper.conf. The data home is not the default
# \$HOME/.local/share because this user's home is the install dir, which
# ProtectSystem=strict leaves read-only — and \`podman run\` has to write a
# container layer into the image store.
Environment=XDG_RUNTIME_DIR=$(runtime_dir_for "$user")
Environment=XDG_DATA_HOME=$SCRAPER_DATA_HOME
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
ReadWritePaths=$SCRAPER_WORK_DIR $install_dir/scraper-runner /var/log/timetiles $(runtime_dir_for "$user") $SCRAPER_DATA_HOME/containers
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
    systemd-tmpfiles --create /etc/tmpfiles.d/timetiles-scraper.conf

    systemctl start timescrape-runner.service

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
    print_step "Verifying scraper runner health..."

    if ! wait_for_health "http://localhost:4000/health" 30 5; then
        print_error "Scraper runner health check failed"
        journalctl -u timescrape-runner --no-pager -n 20
        die "Scraper runner health check failed"
    fi

    print_success "Scraper runner is healthy"
}
