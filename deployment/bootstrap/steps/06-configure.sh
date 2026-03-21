#!/bin/bash
# TimeTiles Bootstrap - Step 06: Configure Environment
# Generates .env.production from template with configured values

run_step() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local user="${APP_USER:-timetiles}"

    local env_template="$install_dir/.env.production.example"
    local env_file="$install_dir/.env.production"

    print_step "Configuring environment..."

    # Check if template exists
    if [[ ! -f "$env_template" ]]; then
        die "Environment template not found: $env_template"
    fi

    # Generate secrets if not already set
    # Secrets are NOT saved to state — they are only written to .env.production (chmod 600).
    # On resume, they are read from .env.production rather than the plaintext state file.
    if [[ -z "${DB_PASSWORD:-}" ]]; then
        DB_PASSWORD=$(generate_password 24)
        print_info "Generated database password"
    fi

    if [[ -z "${PAYLOAD_SECRET:-}" ]]; then
        PAYLOAD_SECRET=$(generate_secret 32)
        print_info "Generated Payload secret"
    fi

    if [[ -z "${RESTIC_PASSWORD:-}" ]]; then
        RESTIC_PASSWORD=$(generate_secret 32)
        print_info "Generated restic backup password"
    fi

    if [[ "${SKIP_SCRAPER:-true}" != "true" ]]; then
        if [[ -z "${SCRAPER_API_KEY:-}" ]]; then
            SCRAPER_API_KEY=$(generate_secret 32)
            print_info "Generated scraper API key"
        fi
    fi

    # Create .env.production from template
    print_step "Creating .env.production..."
    cp "$env_template" "$env_file"

    # Substitute values using sed with | as delimiter (to handle URLs)
    print_step "Configuring values..."

    # Required values
    sed -i "s|DOMAIN_NAME=.*|DOMAIN_NAME=$DOMAIN_NAME|" "$env_file"
    sed -i "s|DB_PASSWORD=.*|DB_PASSWORD=$DB_PASSWORD|" "$env_file"
    sed -i "s|PAYLOAD_SECRET=.*|PAYLOAD_SECRET=$PAYLOAD_SECRET|" "$env_file"
    sed -i "s|LETSENCRYPT_EMAIL=.*|LETSENCRYPT_EMAIL=$LETSENCRYPT_EMAIL|" "$env_file"

    # Backup configuration
    sed -i "s|RESTIC_PASSWORD=.*|RESTIC_PASSWORD=$RESTIC_PASSWORD|" "$env_file"

    # Set NEXT_PUBLIC_PAYLOAD_URL (derived from domain)
    sed -i "s|NEXT_PUBLIC_PAYLOAD_URL=.*|NEXT_PUBLIC_PAYLOAD_URL=https://$DOMAIN_NAME|" "$env_file"

    # Pre-configure scraper API key (if enabled). SCRAPER_RUNNER_URL is set later
    # by step 13 after the runner is installed, so the health check doesn't fail
    # during step 07 when the runner isn't running yet.
    if [[ "${SKIP_SCRAPER:-true}" != "true" ]]; then
        print_step "Configuring scraper API key..."
        sed -i "s|# SCRAPER_API_KEY=.*|SCRAPER_API_KEY=$SCRAPER_API_KEY|" "$env_file"
        sed -i "s|# SCRAPER_PORT=.*|SCRAPER_PORT=4000|" "$env_file"
    fi

    # Set secure file permissions
    chmod 600 "$env_file"
    chown "$user:$user" "$env_file"

    # Configure nginx with domain name
    print_step "Configuring nginx with domain: $DOMAIN_NAME"
    configure_nginx "$install_dir" "$DOMAIN_NAME"

    # Verify configuration
    print_step "Verifying configuration..."
    verify_env_file "$env_file"

    # Create credentials file for reference
    create_credentials_file

    print_success "Environment configured"
}

verify_env_file() {
    local env_file="$1"

    # Check required variables are set (not placeholder values)
    local required_vars=(
        "DOMAIN_NAME"
        "DB_PASSWORD"
        "PAYLOAD_SECRET"
        "LETSENCRYPT_EMAIL"
    )

    for var in "${required_vars[@]}"; do
        local value
        value=$(grep "^${var}=" "$env_file" | cut -d= -f2-)

        if [[ -z "$value" ]] || [[ "$value" == *"CHANGE_ME"* ]] || [[ "$value" == *"your-"* ]]; then
            die "Environment variable not properly configured: $var"
        fi
    done

    print_success "Environment file verified"
}

create_credentials_file() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"

    print_step "Displaying credentials (save these now!)..."

    echo ""
    echo "========================================================================"
    echo " IMPORTANT: Save these credentials now — they will not be shown again"
    echo "========================================================================"
    echo ""
    echo "  Domain: https://$DOMAIN_NAME"
    echo "  Dashboard: https://$DOMAIN_NAME/dashboard"
    echo ""
    echo "  Database Password: $DB_PASSWORD"
    echo "  Payload Secret: $PAYLOAD_SECRET"
    echo "  Backup Password: $RESTIC_PASSWORD"
    if [[ "${SKIP_SCRAPER:-true}" != "true" ]] && [[ -n "${SCRAPER_API_KEY:-}" ]]; then
        echo "  Scraper API Key: $SCRAPER_API_KEY"
    fi
    echo ""
    echo "  CRITICAL: The backup password is required to restore backups!"
    echo "========================================================================"
    echo ""

    # Write a reference file WITHOUT secrets
    cat > "$install_dir/credentials.txt" << EOF
# TimeTiles Deployment Reference
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# ============================================================================

Domain: https://$DOMAIN_NAME
Dashboard: https://$DOMAIN_NAME/dashboard

Secrets are stored in: $install_dir/.env.production
Backup password is in: $install_dir/.env.production (RESTIC_PASSWORD)

# ============================================================================
# Credentials were displayed during bootstrap — they are NOT stored in this file.
# To view secrets, check .env.production (readable only by the app user).
# ============================================================================
EOF

    chmod 600 "$install_dir/credentials.txt"
    chown root:root "$install_dir/credentials.txt"

    print_success "Credentials displayed (save them now!)"
    print_warning "Secrets are only stored in .env.production — keep that file secure!"
}
