#!/bin/bash
# TimeTiles Bootstrap - Step 01: System Setup
# Updates system, installs essential packages, configures swap

run_step() {
    print_step "Updating package lists..."
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq

    print_step "Upgrading installed packages..."
    apt-get upgrade -y -qq

    print_step "Installing essential packages..."
    apt-get install -y -qq \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg \
        lsb-release \
        software-properties-common \
        git \
        git-lfs \
        make \
        jq \
        openssl \
        dnsutils \
        fail2ban \
        unattended-upgrades \
        logrotate

    # Check memory and create swap if needed
    if ! check_memory; then
        print_step "Creating swap file (low memory detected)..."
        create_swap
    fi

    # Configure automatic security updates
    print_step "Configuring automatic security updates..."
    configure_auto_updates

    print_success "System setup complete"
}

create_swap() {
    local swap_size="${SWAP_SIZE:-4G}"

    # Check if swap already exists
    if swapon --show | grep -q "swap"; then
        print_info "Swap already configured"
        return 0
    fi

    # Create swap file
    fallocate -l "$swap_size" /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=4096 status=progress
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile

    # Make permanent
    if ! grep -q "/swapfile" /etc/fstab; then
        echo "/swapfile none swap sw 0 0" >> /etc/fstab
    fi

    print_success "Created $swap_size swap file"
}

configure_auto_updates() {
    # Configure unattended-upgrades
    cat > /etc/apt/apt.conf.d/20auto-upgrades << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF

    # Configure what to upgrade
    cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}";
    "${distro_id}:${distro_codename}-security";
    "${distro_id}ESMApps:${distro_codename}-apps-security";
    "${distro_id}ESM:${distro_codename}-infra-security";
};
Unattended-Upgrade::Package-Blacklist {
};
Unattended-Upgrade::DevRelease "false";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

    # Enable the service
    systemctl enable unattended-upgrades
    systemctl start unattended-upgrades

    print_success "Automatic security updates enabled"
}
