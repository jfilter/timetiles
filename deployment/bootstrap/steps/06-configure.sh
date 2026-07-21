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

    # Secrets are NOT saved to state — they are only written to .env.production
    # (chmod 600). On resume they are therefore read back out of .env.production
    # rather than a plaintext state file.
    #
    # That read-back is what this loop does, and until now it did not exist: the
    # comment claimed it while the code below unconditionally generated fresh
    # values on every run. Re-running step 06 against a live install issued a
    # DB_PASSWORD that no longer opened the existing database and a
    # PAYLOAD_SECRET that invalidated every session and every encrypted field —
    # bricking the deployment rather than reconfiguring it.
    local secret_var existing_secret
    for secret_var in DB_PASSWORD PAYLOAD_SECRET RESTIC_PASSWORD SCRAPER_API_KEY; do
        # An explicitly configured value (config file / env) always wins.
        [[ -n "${!secret_var:-}" ]] && continue

        existing_secret="$(read_existing_secret "$env_file" "$secret_var")"
        if [[ -n "$existing_secret" ]]; then
            printf -v "$secret_var" '%s' "$existing_secret"
            print_info "Reusing existing $secret_var from .env.production"
        fi
    done

    # Generate secrets if not already set
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

    # Point the container's /app/apps/web/config mount at the cloned source
    # repo's apps/web/config dir, so bundled data-package manifests refresh
    # on every `git pull`. The path is resolved relative to the compose file.
    #
    # This is also the template's default, so the sed is normally a no-op — it
    # stays because it must hold even for an .env.production carried over from
    # an older install, where the default was "./config".
    #
    # It must NOT be "./config" (deployment/config): the single mount also
    # carries data-packages/ and
    # data-packages.activations.yml, which exist only under apps/web/config and
    # are sparse-checked-out by step 05 for exactly this reason. Pointing it at
    # deployment/config would mount a dir holding nothing but an example file
    # and silently strip every bundled data package.
    #
    # Consequence for operators: timetiles.yml belongs in <src>/apps/web/config/
    # (where .gitignore already excludes it so `git pull` keeps working), NOT in
    # deployment/config/. A file left at the latter is never mounted, and
    # getAppConfig() reads a missing file as "no overrides" — so every rate
    # limit, quota and batch size stays at its default without logging a thing.
    sed -i "s|^CONFIG_DIR=.*|CONFIG_DIR=../apps/web/config|" "$env_file"

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

# Read a secret back out of an existing .env.production.
#
# Prints nothing when the file is absent, the key is absent, or the value is
# still one of the template's placeholders — the caller treats "nothing" as
# "generate a fresh one", so a half-written .env.production from a failed
# earlier run self-heals instead of being preserved as a broken value.
read_existing_secret() {
    local file="$1"
    local key="$2"
    local value

    [[ -f "$file" ]] || return 0

    value="$(grep -m1 "^${key}=" "$file" 2>/dev/null | cut -d= -f2-)" || true

    case "$value" in
        "" | *CHANGE_ME* | *your-*) return 0 ;;
    esac

    printf '%s' "$value"
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
        # `|| true`: a grep miss is precisely the case the die below exists to
        # report, but under `set -o pipefail` grep's exit 1 propagates through
        # the pipe and would abort the step here — swallowing the diagnostic
        # and leaving the operator with a bare "failed with exit code 1".
        value=$(grep -m1 "^${var}=" "$env_file" | cut -d= -f2-) || true

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
