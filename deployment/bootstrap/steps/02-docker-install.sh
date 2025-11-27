#!/bin/bash
# TimeTiles Bootstrap - Step 02: Docker Installation
# Installs Docker CE and Docker Compose plugin

run_step() {
    # Check if Docker is already installed
    if check_command docker && docker --version &>/dev/null; then
        print_info "Docker is already installed"
        docker --version

        # Ensure compose plugin is available
        if docker compose version &>/dev/null; then
            print_info "Docker Compose plugin is available"
            docker compose version
            ensure_docker_running
            return 0
        fi
    fi

    print_step "Removing old Docker versions (if any)..."
    apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

    print_step "Adding Docker GPG key..."
    install -m 0755 -d /etc/apt/keyrings
    retry 3 5 curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
    chmod a+r /etc/apt/keyrings/docker.asc

    print_step "Adding Docker repository..."
    echo \
        "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu \
        $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
        tee /etc/apt/sources.list.d/docker.list > /dev/null

    print_step "Installing Docker..."
    apt-get update -qq
    apt-get install -y -qq \
        docker-ce \
        docker-ce-cli \
        containerd.io \
        docker-buildx-plugin \
        docker-compose-plugin

    ensure_docker_running

    # Verify installation
    print_step "Verifying Docker installation..."
    docker --version
    docker compose version

    # Configure Docker daemon for production
    configure_docker_daemon

    print_success "Docker installation complete"
}

ensure_docker_running() {
    print_step "Ensuring Docker service is running..."
    systemctl enable docker
    systemctl start docker

    # Wait for Docker to be ready
    local attempts=0
    while ! docker info &>/dev/null; do
        if [[ $attempts -ge 30 ]]; then
            die "Docker failed to start"
        fi
        sleep 1
        attempts=$((attempts + 1))
    done

    print_success "Docker is running"
}

configure_docker_daemon() {
    print_step "Configuring Docker daemon..."

    # Create daemon.json with production settings
    # DNS servers are needed for container builds to reach package repos
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json << 'EOF'
{
    "dns": ["8.8.8.8", "8.8.4.4"],
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "storage-driver": "overlay2",
    "live-restore": true
}
EOF

    # Restart Docker to apply settings
    systemctl restart docker

    print_success "Docker daemon configured"
}
