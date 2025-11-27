#!/bin/bash
# TimeTiles Bootstrap - Step 10: SSH Hardening
# Secures SSH by disabling password auth, root login, and applying best practices

run_step() {
    # Check if SSH hardening should be skipped
    if [[ "${SKIP_SSH_HARDENING:-false}" == "true" ]]; then
        print_skip "SSH hardening skipped (SKIP_SSH_HARDENING=true)"
        return 0
    fi

    local sshd_config="/etc/ssh/sshd_config"
    local sshd_backup="/etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)"
    local ssh_port="${SSH_PORT:-22}"

    print_step "Hardening SSH configuration..."

    # Backup original config
    if [[ -f "$sshd_config" ]]; then
        cp "$sshd_config" "$sshd_backup"
        print_info "Backed up sshd_config to $sshd_backup"
    fi

    # Check if SSH keys are configured for at least one user
    # This prevents lockout if password auth is disabled
    local has_ssh_keys=false
    for home_dir in /home/* /root; do
        if [[ -f "$home_dir/.ssh/authorized_keys" ]] && [[ -s "$home_dir/.ssh/authorized_keys" ]]; then
            has_ssh_keys=true
            local user=$(basename "$home_dir")
            [[ "$home_dir" == "/root" ]] && user="root"
            print_info "Found SSH keys for user: $user"
        fi
    done

    if [[ "$has_ssh_keys" != "true" ]]; then
        print_warning "No SSH authorized_keys found!"
        print_warning "Password authentication will NOT be disabled to prevent lockout"
        print_warning "Add SSH keys and re-run bootstrap to enable full SSH hardening"
    fi

    # Apply hardening settings
    print_step "Applying SSH hardening settings..."

    # Function to set sshd_config option
    set_sshd_option() {
        local option="$1"
        local value="$2"
        if grep -q "^${option}" "$sshd_config"; then
            sed -i "s/^${option}.*/${option} ${value}/" "$sshd_config"
        elif grep -q "^#${option}" "$sshd_config"; then
            sed -i "s/^#${option}.*/${option} ${value}/" "$sshd_config"
        else
            echo "${option} ${value}" >> "$sshd_config"
        fi
    }

    # Disable root login
    set_sshd_option "PermitRootLogin" "no"
    print_info "Disabled root SSH login"

    # Only disable password auth if SSH keys exist
    if [[ "$has_ssh_keys" == "true" ]]; then
        set_sshd_option "PasswordAuthentication" "no"
        print_info "Disabled password authentication (SSH keys required)"
    else
        set_sshd_option "PasswordAuthentication" "yes"
        print_warning "Password authentication kept enabled (no SSH keys found)"
    fi

    # Enable public key authentication
    set_sshd_option "PubkeyAuthentication" "yes"
    print_info "Enabled public key authentication"

    # Disable challenge-response authentication
    set_sshd_option "ChallengeResponseAuthentication" "no"
    set_sshd_option "KbdInteractiveAuthentication" "no"
    print_info "Disabled challenge-response authentication"

    # Keep PAM enabled (needed for account management)
    set_sshd_option "UsePAM" "yes"

    # Limit authentication attempts
    set_sshd_option "MaxAuthTries" "3"
    print_info "Limited max auth tries to 3"

    # Reduce login grace time
    set_sshd_option "LoginGraceTime" "30"
    print_info "Set login grace time to 30 seconds"

    # Disable X11 forwarding (not needed for server)
    set_sshd_option "X11Forwarding" "no"
    print_info "Disabled X11 forwarding"

    # Disable agent forwarding
    set_sshd_option "AllowAgentForwarding" "no"
    print_info "Disabled agent forwarding"

    # Disable TCP forwarding
    set_sshd_option "AllowTcpForwarding" "no"
    print_info "Disabled TCP forwarding"

    # Set custom port if specified
    if [[ "$ssh_port" != "22" ]]; then
        set_sshd_option "Port" "$ssh_port"
        print_info "Set SSH port to $ssh_port"
    fi

    # Test the configuration before applying
    print_step "Testing SSH configuration..."
    if ! sshd -t; then
        print_error "SSH configuration test failed!"
        print_warning "Restoring backup configuration..."
        cp "$sshd_backup" "$sshd_config"
        die "SSH hardening failed - configuration restored from backup"
    fi

    print_success "SSH configuration test passed"

    # Restart SSH to apply changes
    # Ubuntu 24.04 uses 'ssh.service' instead of 'sshd.service'
    print_step "Restarting SSH service..."
    if systemctl list-units --type=service --all | grep -q "sshd.service"; then
        systemctl restart sshd
    else
        systemctl restart ssh
    fi

    print_success "SSH hardening complete"

    # Print summary
    echo ""
    print_step "SSH Hardening Summary:"
    echo "  - Root login: DISABLED"
    if [[ "$has_ssh_keys" == "true" ]]; then
        echo "  - Password auth: DISABLED (SSH keys required)"
    else
        echo "  - Password auth: ENABLED (add SSH keys to disable)"
    fi
    echo "  - Public key auth: ENABLED"
    echo "  - Max auth tries: 3"
    echo "  - Login grace time: 30s"
    echo "  - X11 forwarding: DISABLED"
    echo "  - SSH port: $ssh_port"
    echo ""
    print_warning "IMPORTANT: Verify you can SSH in before closing this session!"
}
