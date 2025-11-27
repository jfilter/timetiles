#!/bin/bash
# TimeTiles Bootstrap - Interactive Prompts
# Configuration loading and user interaction

# Prevent multiple sourcing
[[ -n "${_BOOTSTRAP_PROMPTS_LOADED:-}" ]] && return 0
_BOOTSTRAP_PROMPTS_LOADED=1

# ============================================================================
# CONFIGURATION
# ============================================================================
NON_INTERACTIVE="${NON_INTERACTIVE:-false}"

# ============================================================================
# PROMPT FUNCTIONS
# ============================================================================

# Prompt for a value with optional default
# Usage: prompt "Question" "default_value" "variable_name"
prompt() {
    local question="$1"
    local default="$2"
    local varname="$3"

    # Check if variable is already set and non-empty
    local current_value="${!varname:-}"
    if [[ -n "$current_value" ]]; then
        return 0
    fi

    # Use default in non-interactive mode
    if [[ "$NON_INTERACTIVE" == "true" ]]; then
        if [[ -n "$default" ]]; then
            eval "$varname=\"$default\""
            return 0
        else
            print_error "Required value not set: $varname (non-interactive mode)"
            return 1
        fi
    fi

    # Interactive prompt
    local prompt_text="$question"
    if [[ -n "$default" ]]; then
        prompt_text="$question [$default]"
    fi

    local response
    read -r -p "$prompt_text: " response

    if [[ -n "$response" ]]; then
        eval "$varname=\"$response\""
    elif [[ -n "$default" ]]; then
        eval "$varname=\"$default\""
    else
        print_error "Value required for: $varname"
        return 1
    fi

    return 0
}

# Yes/No prompt
# Usage: prompt_yn "Question" "default (y/n)"
# Returns 0 for yes, 1 for no
prompt_yn() {
    local question="$1"
    local default="${2:-y}"

    if [[ "$NON_INTERACTIVE" == "true" ]]; then
        [[ "${default,,}" == "y" ]]
        return $?
    fi

    local prompt_text
    if [[ "${default,,}" == "y" ]]; then
        prompt_text="$question [Y/n]"
    else
        prompt_text="$question [y/N]"
    fi

    local response
    read -r -p "$prompt_text: " response

    if [[ -z "$response" ]]; then
        response="$default"
    fi

    [[ "${response,,}" == "y" || "${response,,}" == "yes" ]]
}

# Prompt for password (hidden input)
# Usage: prompt_password "Question" "variable_name"
prompt_password() {
    local question="$1"
    local varname="$2"

    # Check if variable is already set
    local current_value="${!varname:-}"
    if [[ -n "$current_value" ]]; then
        return 0
    fi

    if [[ "$NON_INTERACTIVE" == "true" ]]; then
        print_error "Password not set: $varname (non-interactive mode)"
        return 1
    fi

    local password
    read -r -s -p "$question: " password
    echo ""

    if [[ -z "$password" ]]; then
        print_error "Password required"
        return 1
    fi

    eval "$varname=\"$password\""
    return 0
}

# ============================================================================
# SECRET GENERATION
# ============================================================================

# Generate a random secret
# Usage: generate_secret [length]
generate_secret() {
    local length="${1:-32}"
    openssl rand -base64 "$length" 2>/dev/null | tr -d '/+=' | head -c "$length"
}

# Generate a secure password
# Usage: generate_password [length]
generate_password() {
    local length="${1:-24}"
    openssl rand -base64 "$length" 2>/dev/null | tr -d '/+=' | head -c "$length"
}

# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================

# Validate domain name format
validate_domain() {
    local domain="$1"

    # Basic domain validation (allows subdomains)
    if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        print_error "Invalid domain format: $domain"
        return 1
    fi

    # Must have at least one dot (TLD)
    if [[ ! "$domain" =~ \. ]]; then
        print_error "Domain must include TLD: $domain"
        return 1
    fi

    return 0
}

# Validate email format
validate_email() {
    local email="$1"

    if [[ ! "$email" =~ ^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$ ]]; then
        print_error "Invalid email format: $email"
        return 1
    fi

    return 0
}

# Validate port number
validate_port() {
    local port="$1"

    if [[ ! "$port" =~ ^[0-9]+$ ]]; then
        print_error "Port must be a number: $port"
        return 1
    fi

    if [[ "$port" -lt 1 || "$port" -gt 65535 ]]; then
        print_error "Port must be between 1 and 65535: $port"
        return 1
    fi

    return 0
}

# ============================================================================
# CONFIGURATION FILE HANDLING
# ============================================================================

# Load configuration from file
# Usage: load_config "config_file"
load_config() {
    local config_file="$1"

    if [[ -f "$config_file" ]]; then
        print_info "Loading configuration from $config_file"
        # shellcheck disable=SC1090
        source "$config_file"
        return 0
    fi

    return 1
}

# Try to load config from multiple locations
load_config_files() {
    local config_loaded=false

    # Try these locations in order
    local config_locations=(
        "${CONFIG_FILE:-}"
        "./bootstrap.conf"
        "/etc/timetiles/bootstrap.conf"
    )

    for config_file in "${config_locations[@]}"; do
        if [[ -n "$config_file" ]] && [[ -f "$config_file" ]]; then
            load_config "$config_file"
            config_loaded=true
            break
        fi
    done

    # Also try to load from saved state
    if load_config_from_state 2>/dev/null; then
        print_info "Loaded configuration from previous run"
    fi

    if [[ "$config_loaded" == "false" ]]; then
        print_info "No configuration file found - will prompt for values"
    fi
}

# Collect all required configuration
collect_configuration() {
    print_header "Configuration"

    # Required settings
    prompt "Domain name (e.g., timetiles.example.com)" "" "DOMAIN_NAME" || return 1
    validate_domain "$DOMAIN_NAME" || return 1

    prompt "Let's Encrypt email" "admin@$DOMAIN_NAME" "LETSENCRYPT_EMAIL" || return 1
    validate_email "$LETSENCRYPT_EMAIL" || return 1

    # Optional settings with defaults
    prompt "Repository URL" "https://github.com/jfilter/timetiles.git" "REPO_URL"
    prompt "Repository branch" "main" "REPO_BRANCH"
    prompt "Installation directory" "/opt/timetiles" "INSTALL_DIR"
    prompt "Application user" "timetiles" "APP_USER"

    # Auto-generate secrets if not provided
    if [[ -z "${DB_PASSWORD:-}" ]]; then
        DB_PASSWORD=$(generate_password 24)
        print_info "Generated database password"
    fi

    if [[ -z "${PAYLOAD_SECRET:-}" ]]; then
        PAYLOAD_SECRET=$(generate_secret 32)
        print_info "Generated Payload secret"
    fi

    # Save config for resume
    save_config_to_state "DOMAIN_NAME" "$DOMAIN_NAME"
    save_config_to_state "LETSENCRYPT_EMAIL" "$LETSENCRYPT_EMAIL"
    save_config_to_state "REPO_URL" "$REPO_URL"
    save_config_to_state "REPO_BRANCH" "$REPO_BRANCH"
    save_config_to_state "INSTALL_DIR" "$INSTALL_DIR"
    save_config_to_state "APP_USER" "$APP_USER"
    save_config_to_state "DB_PASSWORD" "$DB_PASSWORD"
    save_config_to_state "PAYLOAD_SECRET" "$PAYLOAD_SECRET"

    # Display summary
    echo ""
    print_info "Configuration summary:"
    echo "  Domain: $DOMAIN_NAME"
    echo "  Email: $LETSENCRYPT_EMAIL"
    echo "  Repository: $REPO_URL ($REPO_BRANCH)"
    echo "  Install path: $INSTALL_DIR"
    echo "  App user: $APP_USER"
    echo ""

    return 0
}
