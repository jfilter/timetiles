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
# Podman's runtime state (runroot). It cannot be /run/user/$uid, and not for a
# timing reason: the unit sets ProtectHome=yes, which makes systemd mount an
# empty read-only tmpfs over /run/user as well as /home and /root. Verified
# inside the running service's namespace -- /run/user is mode d--------- and
# contains nothing. So the per-user runtime dir was never visible to the runner
# no matter when logind created it, podman fell back to $HOME/rundir, and that
# is read-only too under ProtectSystem=strict. Every scraper run died with
#   mkdir /opt/timetiles-src/deployment/rundir/libpod: no such file or directory
# while systemctl reported the unit active. A tmpfiles.d entry recreates this
# path at every boot, before any regular service starts.
SCRAPER_RUNTIME_DIR="/run/timescrape"

# Podman's image store (graphroot) lives under XDG_DATA_HOME. It cannot stay at
# the default $HOME/.local/share: the app user's home IS the install dir, which
# is a git working tree and read-only under ProtectSystem=strict. That put ~1 GB
# of container images inside the checkout and out of the service's reach.
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
        env "XDG_RUNTIME_DIR=$SCRAPER_RUNTIME_DIR" \
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

    # Podman's directories, recreated at every boot by systemd-tmpfiles.
    #
    # This deliberately replaces the previous `loginctl enable-linger` approach.
    # Lingering existed to make logind materialise /run/user/$uid for podman --
    # which the runner unit could never see anyway (ProtectHome=yes), and which
    # coupled the whole feature to logind, the component whose vz boot-race wedge
    # made podman block instead of fail. tmpfiles.d runs as part of
    # systemd-tmpfiles-setup.service, ordered before every regular service, so
    # these directories are simply always there and logind is out of the picture.
    cat > /etc/tmpfiles.d/timetiles-scraper.conf << EOF
# Rootless Podman state for the TimeScrape runner. Recreated on every boot:
# $SCRAPER_RUNTIME_DIR lives on tmpfs, and $SCRAPER_WORK_DIR is under /tmp, which
# is cleared. Both appear in the unit's ReadWritePaths without a leading dash, so
# a missing one stops the unit rather than letting it run unable to write.
d $SCRAPER_RUNTIME_DIR 0700 $user $user -
d $SCRAPER_WORK_DIR 0700 $user $user -
d $SCRAPER_DATA_HOME/containers 0700 $user $user -
EOF
    systemd-tmpfiles --create /etc/tmpfiles.d/timetiles-scraper.conf
    print_info "Created podman runtime and storage directories"

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
After=network-online.target timetiles.service
Wants=network-online.target

[Service]
Type=simple
User=$user
Group=$user
WorkingDirectory=$install_dir/scraper-runner
# Both paths are created by /etc/tmpfiles.d/timetiles-scraper.conf, so they exist
# before this unit starts and do not depend on logind having opened a session.
Environment=XDG_RUNTIME_DIR=$SCRAPER_RUNTIME_DIR
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
ReadWritePaths=$SCRAPER_WORK_DIR $install_dir/scraper-runner /var/log/timetiles $SCRAPER_RUNTIME_DIR $SCRAPER_DATA_HOME/containers
ProtectHome=yes
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
