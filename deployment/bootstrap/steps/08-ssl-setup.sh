#!/bin/bash
# TimeTiles Bootstrap - Step 08: SSL Setup
# Obtains Let's Encrypt SSL certificate

run_step() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local app_dir="$install_dir/app"
    local user="${APP_USER:-timetiles}"

    # Check if SSL should be skipped
    if [[ "${SKIP_SSL:-false}" == "true" ]]; then
        print_skip "SSL setup skipped (SKIP_SSL=true)"
        print_info "You can set up SSL later with: ./deploy.sh ssl"
        return 0
    fi

    # Check DNS resolution
    print_step "Checking DNS configuration..."

    if ! check_dns_resolution "$DOMAIN_NAME"; then
        print_warning "DNS may not be configured correctly"
        print_info "Ensure your domain points to this server's IP address"

        if is_interactive; then
            if ! prompt_yn "Continue with SSL setup anyway?" "n"; then
                print_skip "SSL setup skipped - run './deploy.sh ssl' after fixing DNS"
                return 0
            fi
        else
            print_warning "Skipping SSL setup in non-interactive mode"
            print_info "Run './deploy.sh ssl' after DNS is configured"
            return 0
        fi
    fi

    # Change to app directory
    cd "$app_dir" || die "Cannot change to $app_dir"

    # Run SSL setup
    print_step "Requesting SSL certificate from Let's Encrypt..."
    print_info "Domain: $DOMAIN_NAME"
    print_info "Email: $LETSENCRYPT_EMAIL"

    if ! sudo -u "$user" ./deployment/deploy.sh ssl; then
        print_warning "SSL setup failed"
        print_info "This is often due to DNS not being configured yet"
        print_info "Your application is still accessible via HTTP"
        print_info "Run './deploy.sh ssl' after DNS is properly configured"

        # Don't fail the bootstrap - SSL can be set up later
        return 0
    fi

    print_success "SSL certificate obtained"

    # Verify HTTPS is working
    print_step "Verifying HTTPS..."
    sleep 5

    if curl -sf --max-time 10 "https://$DOMAIN_NAME/api/health" >/dev/null 2>&1; then
        print_success "HTTPS is working!"
    else
        print_warning "HTTPS verification failed - certificate may still be propagating"
    fi

    print_success "SSL setup complete"
}
