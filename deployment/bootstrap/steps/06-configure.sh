#!/bin/bash
# TimeTiles Bootstrap - Step 06: Configure Environment
# Generates .env.production from template with configured values

run_step() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local app_dir="$install_dir/app"
    local user="${APP_USER:-timetiles}"

    local env_template="$app_dir/deployment/.env.production.example"
    local env_file="$app_dir/deployment/.env.production"

    print_step "Configuring environment..."

    # Check if template exists
    if [[ ! -f "$env_template" ]]; then
        die "Environment template not found: $env_template"
    fi

    # Generate secrets if not already set
    if [[ -z "${DB_PASSWORD:-}" ]]; then
        DB_PASSWORD=$(generate_password 24)
        print_info "Generated database password"
        save_config_to_state "DB_PASSWORD" "$DB_PASSWORD"
    fi

    if [[ -z "${PAYLOAD_SECRET:-}" ]]; then
        PAYLOAD_SECRET=$(generate_secret 32)
        print_info "Generated Payload secret"
        save_config_to_state "PAYLOAD_SECRET" "$PAYLOAD_SECRET"
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

    # Set NEXT_PUBLIC_PAYLOAD_URL (derived from domain)
    sed -i "s|NEXT_PUBLIC_PAYLOAD_URL=.*|NEXT_PUBLIC_PAYLOAD_URL=https://$DOMAIN_NAME|" "$env_file"

    # Set secure file permissions
    chmod 600 "$env_file"
    chown "$user:$user" "$env_file"

    # Configure nginx with domain name
    print_step "Configuring nginx with domain: $DOMAIN_NAME"
    configure_nginx "$app_dir" "$DOMAIN_NAME"

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
    local creds_file="$install_dir/credentials.txt"

    print_step "Creating credentials file..."

    cat > "$creds_file" << EOF
# TimeTiles Credentials
# Generated: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# KEEP THIS FILE SECURE - Contains sensitive information
# ============================================================================

Domain: https://$DOMAIN_NAME
Admin Panel: https://$DOMAIN_NAME/admin

Database:
  Host: postgres (internal Docker network)
  Port: 5432
  Database: ${DB_NAME:-timetiles}
  Username: ${DB_USER:-timetiles_user}
  Password: $DB_PASSWORD

Payload CMS:
  Secret: $PAYLOAD_SECRET

Let's Encrypt:
  Email: $LETSENCRYPT_EMAIL

# ============================================================================
# After first login, create an admin user at:
# https://$DOMAIN_NAME/admin
# ============================================================================
EOF

    chmod 600 "$creds_file"
    chown root:root "$creds_file"

    print_success "Credentials saved to: $creds_file"
    print_warning "Keep this file secure!"
}
