#!/bin/bash
# TimeTiles Bootstrap - Step 08: SSL Setup
# Obtains Let's Encrypt SSL certificate

run_step() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local user="${APP_USER:-timetiles}"

    # Check if SSL should be skipped
    if [[ "${SKIP_SSL:-false}" == "true" ]]; then
        print_skip "SSL setup skipped (SKIP_SSL=true)"
        print_info "You can set up SSL later with: timetiles ssl"
        return 0
    fi

    # Check DNS resolution
    print_step "Checking DNS configuration..."

    if ! check_dns_resolution "$DOMAIN_NAME"; then
        print_warning "DNS may not be configured correctly"
        print_info "Ensure your domain points to this server's IP address"

        if is_interactive; then
            if ! prompt_yn "Continue with SSL setup anyway?" "n"; then
                print_skip "SSL setup skipped - run 'timetiles ssl' after fixing DNS"
                return 0
            fi
        else
            print_warning "Skipping SSL setup in non-interactive mode"
            print_info "Run 'timetiles ssl' after DNS is configured"
            return 0
        fi
    fi

    # Change to install directory
    cd "$install_dir" || die "Cannot change to $install_dir"

    # Run SSL setup
    print_step "Requesting SSL certificate from Let's Encrypt..."
    print_info "Domain: $DOMAIN_NAME"
    print_info "Email: $LETSENCRYPT_EMAIL"

    if ! sudo -u "$user" ./timetiles ssl; then
        print_warning "SSL setup failed"
        print_info "This is often due to DNS not being configured yet"
        print_info "Your application is still accessible via HTTP"
        print_info "Run 'timetiles ssl' after DNS is properly configured"

        # Don't fail the bootstrap - SSL can be set up later
        return 0
    fi

    print_success "SSL certificate obtained"

    # Remove the self-signed SSL override so nginx uses the Let's Encrypt volume
    local ssl_override="$install_dir/docker-compose.ssl-override.yml"
    local cert_switch_failed=false
    if [[ -f "$ssl_override" ]]; then
        print_step "Removing self-signed SSL override (Let's Encrypt is now active)..."
        rm -f "$ssl_override"
        # Deleting the override changes nothing until nginx restarts: the running
        # container keeps its old mounts and goes on serving the self-signed
        # certificate, so every visitor gets a browser warning. Keep the restart
        # output — it is the only explanation of why — and remember the failure so
        # the HTTPS check below is not misreported as slow propagation.
        local restart_output
        if restart_output=$(sudo -u "$user" sg docker -c "cd $install_dir && ./timetiles restart" 2>&1); then
            print_success "Switched to Let's Encrypt certificates"
        else
            cert_switch_failed=true
            print_error "Failed to restart nginx after removing the self-signed override"
            echo "$restart_output" >&2
            print_warning "nginx is still serving the self-signed certificate"
            print_info "Fix the stack, then run: cd $install_dir && ./timetiles restart"
        fi
    fi

    # Verify HTTPS is working
    print_step "Verifying HTTPS..."
    sleep 5

    if curl -sf --max-time 10 "https://$DOMAIN_NAME/api/health" >/dev/null 2>&1; then
        print_success "HTTPS is working!"
    elif [[ "$cert_switch_failed" == "true" ]]; then
        # Propagation is the benign explanation and only applies when the switch
        # actually happened. Here we already know nginx never reloaded, so the
        # failure is the self-signed certificate — report that and fail the step
        # rather than closing with "SSL setup complete" over a broken lock icon.
        print_error "HTTPS verification failed - nginx never reloaded the Let's Encrypt certificate"
        return 1
    else
        print_warning "HTTPS verification failed - certificate may still be propagating"
    fi

    print_success "SSL setup complete"
}
