#!/bin/bash
# TimeTiles Bootstrap - Step 07: Deploy Application
# Pulls and starts the application using timetiles CLI

run_step() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local user="${APP_USER:-timetiles}"

    # Change to install directory
    cd "$install_dir" || die "Cannot change to $install_dir"

    # Helper to run commands as app user with docker group
    # Using 'sg docker' ensures the docker group is active in the session
    run_as_user() {
        sudo -u "$user" sg docker -c "cd $install_dir && $*"
    }

    # Always generate self-signed SSL certificate as a fallback
    # Nginx requires SSL certs to start - Let's Encrypt (Step 08) will replace these if DNS is configured
    setup_self_signed_ssl "$install_dir" "$user"

    # Pull Docker images from registry
    print_step "Pulling Docker images from registry..."
    print_info "This may take a few minutes on first run..."

    if ! run_as_user "./timetiles pull"; then
        die "Failed to pull Docker images"
    fi

    print_success "Docker images pulled"

    # Start services
    print_step "Starting services..."

    if ! run_as_user "./timetiles up"; then
        die "Failed to start services"
    fi

    print_success "Services started"

    # Wait for application to be healthy
    print_step "Waiting for application to be ready..."

    # Initial delay for containers to start
    sleep 15

    # Wait for health check
    if ! wait_for_health "http://localhost:3000/api/health" 300 10; then
        print_error "Application failed to become healthy"
        print_info "Checking logs..."
        run_as_user "./timetiles logs 2>&1 | tail -50"
        die "Application health check failed"
    fi

    # Verify all services
    print_step "Verifying services..."
    run_as_user "./timetiles status"

    print_success "Application deployed successfully"
}

# Set up self-signed SSL as a fallback
# Nginx requires SSL certs to start - these get replaced by Let's Encrypt if DNS is configured
setup_self_signed_ssl() {
    local install_dir="$1"
    local user="$2"
    local ssl_dir="$install_dir/ssl"

    print_step "Setting up self-signed SSL as fallback..."

    # Generate self-signed certificate
    if ! generate_self_signed_ssl "$DOMAIN_NAME" "$ssl_dir"; then
        die "Failed to generate self-signed SSL certificate"
    fi

    # Set ownership
    chown -R "$user:$user" "$ssl_dir"

    # Create docker-compose override to use local ssl directory instead of volume
    local override_file="$install_dir/docker-compose.ssl-override.yml"

    cat > "$override_file" << EOF
# Auto-generated override for self-signed SSL fallback
services:
  nginx:
    volumes:
      - ${ssl_dir}:/etc/letsencrypt:ro
      - certbot-webroot:/var/www/certbot:ro
      - \${NGINX_CONF_PATH:-./nginx/nginx.conf}:/etc/nginx/nginx.conf:ro
      - ./nginx/sites-enabled:/etc/nginx/sites-enabled:ro
      - ./nginx/proxy-headers.conf:/etc/nginx/proxy-headers.conf:ro

volumes:
  certbot-webroot:
EOF

    chown "$user:$user" "$override_file"

    print_success "Self-signed SSL configured for $DOMAIN_NAME"
    print_info "SSL certificates at: $ssl_dir/live/$DOMAIN_NAME/"
}
