#!/bin/bash
# TimeTiles Bootstrap - Step 10: SSH Hardening
# Secures SSH by disabling password auth, root login, and applying best practices
#
# Settings are written to a drop-in under /etc/ssh/sshd_config.d/ rather than
# edited into /etc/ssh/sshd_config, and the result is verified with `sshd -T`.
# See write_hardening_dropin for why the filename has to sort FIRST.

# sshd is FIRST-match-wins: the earliest occurrence of a keyword is the one that
# takes effect. Ubuntu's stock sshd_config carries
#   Include /etc/ssh/sshd_config.d/*.conf
# as one of its very first directives, and that glob is read in lexicographic
# order. So a drop-in beats the main config file, and the LOWEST-numbered
# drop-in beats every other drop-in. A "99-" name would lose to Ubuntu cloud
# images' /etc/ssh/sshd_config.d/50-cloud-init.conf, which ships
# `PasswordAuthentication yes`.
SSHD_DROPIN="/etc/ssh/sshd_config.d/00-timetiles-hardening.conf"

run_step() {
    # Check if SSH hardening should be skipped
    if [[ "${SKIP_SSH_HARDENING:-false}" == "true" ]]; then
        print_skip "SSH hardening skipped (SKIP_SSH_HARDENING=true)"
        return 0
    fi

    local sshd_config="/etc/ssh/sshd_config"
    local sshd_backup
    sshd_backup="/etc/ssh/sshd_config.bak.$(date +%Y%m%d%H%M%S)"
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
            local user
            user=$(basename "$home_dir")
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
    ensure_dropin_included "$sshd_config"
    write_hardening_dropin "$has_ssh_keys" "$ssh_port"

    # Test the configuration before applying
    print_step "Testing SSH configuration..."
    if ! sshd -t; then
        print_error "SSH configuration test failed!"
        print_warning "Removing hardening drop-in..."
        rm -f "$SSHD_DROPIN"
        die "SSH hardening failed - drop-in removed, existing configuration untouched"
    fi

    print_success "SSH configuration test passed"

    # Verify what sshd will ACTUALLY do, rather than trusting that the write
    # took effect. This is the check that was missing: settings were edited
    # into sshd_config and reported as applied, while a drop-in included ahead
    # of them quietly kept PasswordAuthentication enabled.
    print_step "Verifying effective SSH configuration..."

    local expected_password_auth="no"
    [[ "$has_ssh_keys" == "true" ]] || expected_password_auth="yes"

    local verify_failed=false
    verify_sshd_setting "permitrootlogin" "no" || verify_failed=true
    verify_sshd_setting "passwordauthentication" "$expected_password_auth" || verify_failed=true
    verify_sshd_setting "pubkeyauthentication" "yes" || verify_failed=true
    verify_sshd_setting "kbdinteractiveauthentication" "no" || verify_failed=true
    verify_sshd_setting "maxauthtries" "3" || verify_failed=true
    verify_sshd_setting "port" "$ssh_port" || verify_failed=true

    if [[ "$verify_failed" == "true" ]]; then
        print_warning "Removing hardening drop-in - leaving SSH as it was..."
        rm -f "$SSHD_DROPIN"
        die "SSH hardening could not be enforced (see above).
Another config file is overriding these settings. Inspect the output of
'sshd -T' and the files in /etc/ssh/sshd_config.d/, then re-run this step."
    fi

    print_success "Effective SSH configuration verified"

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
    echo "  - Config file: $SSHD_DROPIN"
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

# Make sure the drop-in directory is actually included. Without the Include
# directive our file is never read at all, and every setting below is a no-op.
ensure_dropin_included() {
    local sshd_config="$1"

    [[ -f "$sshd_config" ]] || return 0

    if grep -qE '^[[:space:]]*Include[[:space:]]+/etc/ssh/sshd_config\.d/\*\.conf' "$sshd_config"; then
        return 0
    fi

    print_warning "sshd_config has no Include for sshd_config.d - adding it"

    # Prepend, so the include is also the first directive sshd sees and
    # first-match-wins works in our favour.
    local tmp
    tmp="$(mktemp)"
    {
        echo "# Added by TimeTiles bootstrap"
        echo "Include /etc/ssh/sshd_config.d/*.conf"
        echo ""
        cat "$sshd_config"
    } > "$tmp"
    # Copy contents rather than mv, to keep sshd_config's owner and mode.
    cat "$tmp" > "$sshd_config"
    rm -f "$tmp"
}

write_hardening_dropin() {
    local has_ssh_keys="$1"
    local ssh_port="$2"

    mkdir -p "$(dirname "$SSHD_DROPIN")"

    {
        echo "# Managed by TimeTiles bootstrap (step 10) - do not edit by hand."
        echo "#"
        echo "# This file deliberately sorts FIRST in /etc/ssh/sshd_config.d/."
        echo "# sshd is first-match-wins and Ubuntu's sshd_config includes this"
        echo "# directory ahead of its own settings, so the lowest-numbered file"
        echo "# here beats both the main config and vendor drop-ins such as"
        echo "# 50-cloud-init.conf, which ships 'PasswordAuthentication yes'."
        echo ""
        echo "PermitRootLogin no"
        if [[ "$has_ssh_keys" == "true" ]]; then
            echo "PasswordAuthentication no"
        else
            # No authorized_keys found anywhere - disabling password auth here
            # would lock the operator out of their own server.
            echo "PasswordAuthentication yes"
        fi
        echo "PubkeyAuthentication yes"
        # KbdInteractiveAuthentication only. ChallengeResponseAuthentication is
        # its removed predecessor and only earns a deprecation warning from
        # modern sshd.
        echo "KbdInteractiveAuthentication no"
        # Keep PAM enabled (needed for account management)
        echo "UsePAM yes"
        echo "MaxAuthTries 3"
        echo "LoginGraceTime 30"
        echo "X11Forwarding no"
        echo "AllowAgentForwarding no"
        echo "AllowTcpForwarding no"
        if [[ "$ssh_port" != "22" ]]; then
            echo "Port $ssh_port"
        fi
    } > "$SSHD_DROPIN"

    chown root:root "$SSHD_DROPIN"
    chmod 600 "$SSHD_DROPIN"

    print_info "Wrote hardening settings to $SSHD_DROPIN"
}

# Compare one keyword against sshd's EFFECTIVE configuration.
# `sshd -T` resolves Includes, drop-ins and defaults, and prints keywords
# lowercased - it is the only trustworthy source for "what will sshd do".
verify_sshd_setting() {
    local key="$1"
    local expected="$2"
    local actual

    actual="$(sshd -T 2>/dev/null | awk -v k="$key" 'tolower($1) == k { print $2; exit }')" || true

    if [[ "$actual" == "$expected" ]]; then
        print_info "Verified $key = $actual"
        return 0
    fi

    print_error "$key is effectively '${actual:-<unset>}', expected '$expected'"
    return 1
}
