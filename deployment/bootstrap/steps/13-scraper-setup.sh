#!/bin/bash
# TimeTiles Bootstrap - Step 13: Scraper Runner Setup (Optional)
# Installs Podman, pulls base images, and configures the TimeScrape runner
# as a systemd service. Skipped by default — set SKIP_SCRAPER=false to enable.

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

    # Install Node.js 24.x from NodeSource
    curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
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

    # Enable lingering so user services start at boot (not just on login)
    loginctl enable-linger "$user" 2>/dev/null || true

    # Verify rootless Podman works
    if sudo -u "$user" podman info --format '{{.Host.Security.Rootless}}' 2>/dev/null | grep -q "true"; then
        print_success "Rootless Podman configured for $user"
    else
        print_warning "Could not verify rootless Podman (may work after re-login)"
    fi
}

pull_base_images() {
    local user="$1"
    local version="$2"
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"

    local python_image="${SCRAPER_PYTHON_IMAGE:-ghcr.io/jfilter/timetiles-scraper-python:$version}"
    local node_image="${SCRAPER_NODE_IMAGE:-ghcr.io/jfilter/timetiles-scraper-node:$version}"

    # Try pulling from GHCR first, fall back to local build
    print_step "Setting up scraper base images..."

    if sudo -u "$user" podman pull "$python_image" 2>/dev/null; then
        sudo -u "$user" podman tag "$python_image" timescrape-python
        print_success "Pulled timescrape-python from registry"
    elif [[ -f "$install_dir/apps/scraper/images/python/Dockerfile" ]]; then
        print_info "Registry pull failed, building timescrape-python locally..."
        sudo -u "$user" podman build -t timescrape-python "$install_dir/apps/scraper/images/python/"
        print_success "Built timescrape-python locally"
    else
        die "Cannot pull or build timescrape-python image"
    fi

    if sudo -u "$user" podman pull "$node_image" 2>/dev/null; then
        sudo -u "$user" podman tag "$node_image" timescrape-node
        print_success "Pulled timescrape-node from registry"
    elif [[ -f "$install_dir/apps/scraper/images/node/Dockerfile" ]]; then
        print_info "Registry pull failed, building timescrape-node locally..."
        sudo -u "$user" podman build -t timescrape-node "$install_dir/apps/scraper/images/node/"
        print_success "Built timescrape-node locally"
    else
        die "Cannot pull or build timescrape-node image"
    fi
}

create_sandbox_network() {
    local user="$1"

    print_step "Creating scraper sandbox network..."

    if sudo -u "$user" podman network ls --format '{{.Name}}' | grep -q "^scraper-sandbox$"; then
        print_info "Scraper sandbox network already exists"
        return 0
    fi

    sudo -u "$user" podman network create scraper-sandbox
    print_success "Created Podman network: scraper-sandbox"
}

install_runner() {
    local install_dir="$1"
    local user="$2"
    local version="$3"
    local runner_dir="$install_dir/scraper-runner"

    print_step "Installing scraper runner..."

    mkdir -p "$runner_dir"

    # Clean previous installation
    rm -rf "${runner_dir:?}/dist" "${runner_dir:?}/node_modules" "${runner_dir:?}/package.json"

    # Strategy 1: Extract pre-built runner from GHCR Docker image (no build tools needed)
    local image="${SCRAPER_IMAGE:-ghcr.io/jfilter/timetiles-scraper}:$version"

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
    elif [[ -f "$install_dir/apps/scraper/Dockerfile" ]]; then
        print_info "Registry pull failed, building runner image locally..."
        # Find the repo root — apps/scraper/Dockerfile may be a symlink to another location
        local dockerfile="$install_dir/apps/scraper/Dockerfile"
        local repo_root
        repo_root="$(cd "$(dirname "$(readlink -f "$dockerfile")")" && cd ../.. && pwd)"
        if ! docker build -t timescrape-runner-local -f "$dockerfile" "$repo_root"; then
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

    # Restart the web container so it picks up the new env var
    if command -v docker &>/dev/null; then
        print_info "Restarting web container to pick up SCRAPER_RUNNER_URL..."
        sudo -u "$user" sg docker -c "cd $install_dir && docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps web" 2>/dev/null || true
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
Documentation=https://github.com/jfilter/timetiles/blob/main/apps/scraper/docs/SETUP.md
After=network-online.target timetiles.service
Wants=network-online.target

[Service]
Type=simple
User=$user
Group=$user
WorkingDirectory=$install_dir/scraper-runner
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
ReadWritePaths=/tmp/timescrape $install_dir/scraper-runner /var/log/timetiles
ProtectHome=yes
PrivateTmp=no

[Install]
WantedBy=multi-user.target
EOF

    systemctl daemon-reload
    systemctl enable timescrape-runner.service

    print_success "Systemd service created: timescrape-runner"
}

start_runner() {
    local user="${APP_USER:-timetiles}"

    print_step "Starting scraper runner..."

    # Create the data directory (required by systemd ReadWritePaths)
    mkdir -p /tmp/timescrape
    chown "$user:$user" /tmp/timescrape

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
