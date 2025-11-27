#!/bin/bash
# TimeTiles Bootstrap - Step 03: Firewall Configuration
# Configures UFW to allow only SSH, HTTP, and HTTPS

run_step() {
    # Check if firewall should be skipped
    if [[ "${SKIP_FIREWALL:-false}" == "true" ]]; then
        print_skip "Firewall setup skipped (SKIP_FIREWALL=true)"
        return 0
    fi

    print_step "Installing UFW firewall..."
    apt-get install -y -qq ufw

    print_step "Configuring firewall rules..."

    # Reset UFW to default state
    ufw --force reset

    # Set default policies
    ufw default deny incoming
    ufw default allow outgoing

    # Allow SSH (prevent lockout!)
    ufw allow ssh
    print_info "Allowed SSH (port 22)"

    # Allow HTTP for Let's Encrypt challenges
    ufw allow 80/tcp
    print_info "Allowed HTTP (port 80)"

    # Allow HTTPS for web traffic
    ufw allow 443/tcp
    print_info "Allowed HTTPS (port 443)"

    # Enable UFW
    print_step "Enabling firewall..."
    ufw --force enable

    # Show status
    print_step "Firewall status:"
    ufw status verbose

    print_success "Firewall configured"
}
