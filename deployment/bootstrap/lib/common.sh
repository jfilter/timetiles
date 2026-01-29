#!/bin/bash
# TimeTiles Bootstrap - Common Utilities
# Shared functions for all bootstrap scripts

# Prevent multiple sourcing
[[ -n "${_BOOTSTRAP_COMMON_LOADED:-}" ]] && return 0
_BOOTSTRAP_COMMON_LOADED=1

# ============================================================================
# COLORS AND FORMATTING
# ============================================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# ============================================================================
# PRINT FUNCTIONS
# ============================================================================
print_header() {
    echo ""
    echo -e "${BLUE}${BOLD}══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}${BOLD}  $1${NC}"
    echo -e "${BLUE}${BOLD}══════════════════════════════════════════════════════════════${NC}"
    echo ""
}

print_step() {
    echo -e "${CYAN}▶${NC} $1"
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1" >&2
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

print_skip() {
    echo -e "${YELLOW}⏭${NC} $1"
}

# ============================================================================
# ERROR HANDLING
# ============================================================================
die() {
    print_error "$1"
    exit "${2:-1}"
}

# Cleanup function - can be overridden by scripts
cleanup() {
    :
}

# Trap handler
trap_handler() {
    local exit_code=$?
    cleanup
    if [[ $exit_code -ne 0 ]]; then
        print_error "Script failed with exit code $exit_code"
        print_info "Check logs and re-run with --resume to continue"
    fi
    exit $exit_code
}

# Set up traps
trap trap_handler EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ============================================================================
# VALIDATION FUNCTIONS
# ============================================================================
check_root() {
    if [[ $EUID -ne 0 ]]; then
        die "This script must be run as root (use sudo)"
    fi
}

check_ubuntu() {
    if [[ ! -f /etc/os-release ]]; then
        die "Cannot detect OS - /etc/os-release not found"
    fi

    source /etc/os-release

    if [[ "$ID" != "ubuntu" ]]; then
        die "This script requires Ubuntu (detected: $ID)"
    fi

    # Extract major version
    local version_major="${VERSION_ID%%.*}"
    if [[ "$version_major" -lt 22 ]]; then
        die "This script requires Ubuntu 22.04 or later (detected: $VERSION_ID)"
    fi

    print_success "Detected Ubuntu $VERSION_ID"
}

check_disk_space() {
    local required_gb="${1:-10}"
    local available_kb
    available_kb=$(df / | awk 'NR==2 {print $4}')
    local available_gb=$((available_kb / 1024 / 1024))

    if [[ $available_gb -lt $required_gb ]]; then
        die "Insufficient disk space: ${available_gb}GB available, ${required_gb}GB required"
    fi

    print_success "Disk space: ${available_gb}GB available"
}

check_memory() {
    local total_kb
    total_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    local total_mb=$((total_kb / 1024))
    local total_gb=$((total_mb / 1024))

    if [[ $total_mb -lt 1800 ]]; then
        print_warning "Low memory: ${total_mb}MB (recommend 2GB+)"
        return 1
    fi

    print_success "Memory: ${total_gb}GB available"
    return 0
}

check_command() {
    local cmd="$1"
    if ! command -v "$cmd" &>/dev/null; then
        return 1
    fi
    return 0
}

# ============================================================================
# RETRY WRAPPER
# ============================================================================
# Retry a command with exponential backoff
# Usage: retry [max_attempts] [initial_delay] command [args...]
retry() {
    local max_attempts="${1:-3}"
    local delay="${2:-5}"
    shift 2

    local attempt=1
    while [[ $attempt -le $max_attempts ]]; do
        if "$@"; then
            return 0
        fi

        if [[ $attempt -lt $max_attempts ]]; then
            print_warning "Attempt $attempt/$max_attempts failed, retrying in ${delay}s..."
            sleep "$delay"
            delay=$((delay * 2))
        fi

        attempt=$((attempt + 1))
    done

    print_error "Command failed after $max_attempts attempts: $*"
    return 1
}

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================
# Check if running in interactive terminal
is_interactive() {
    [[ -t 0 ]]
}

# Get current timestamp in ISO format
timestamp() {
    date -u +"%Y-%m-%dT%H:%M:%SZ"
}

# Ensure a directory exists with proper ownership
ensure_dir() {
    local dir="$1"
    local owner="${2:-root:root}"
    local mode="${3:-755}"

    if [[ ! -d "$dir" ]]; then
        mkdir -p "$dir"
        print_success "Created directory: $dir"
    fi

    chown "$owner" "$dir"
    chmod "$mode" "$dir"
}

# Check if a port is in use
port_in_use() {
    local port="$1"
    ss -tuln | grep -q ":$port "
}

# Wait for a service to be ready
wait_for_health() {
    local url="$1"
    local timeout="${2:-300}"
    local interval="${3:-10}"

    local elapsed=0
    print_step "Waiting for $url to be healthy (timeout: ${timeout}s)..."

    while [[ $elapsed -lt $timeout ]]; do
        if curl -sf --max-time 5 "$url" >/dev/null 2>&1; then
            print_success "Service is healthy!"
            return 0
        fi

        sleep "$interval"
        elapsed=$((elapsed + interval))
        echo -n "."
    done

    echo ""
    print_error "Service failed to become healthy within ${timeout}s"
    return 1
}

# Get public IP address
get_public_ip() {
    curl -sf --max-time 5 https://api.ipify.org 2>/dev/null || \
    curl -sf --max-time 5 https://ifconfig.me 2>/dev/null || \
    curl -sf --max-time 5 https://icanhazip.com 2>/dev/null || \
    echo "unknown"
}

# Check if DNS resolves to this server
check_dns_resolution() {
    local domain="$1"
    local expected_ip
    expected_ip=$(get_public_ip)

    if [[ "$expected_ip" == "unknown" ]]; then
        print_warning "Could not determine public IP"
        return 1
    fi

    local resolved_ip
    resolved_ip=$(dig +short "$domain" 2>/dev/null | head -1)

    if [[ "$resolved_ip" == "$expected_ip" ]]; then
        print_success "DNS for $domain resolves to this server ($expected_ip)"
        return 0
    else
        print_warning "DNS for $domain resolves to $resolved_ip (expected $expected_ip)"
        return 1
    fi
}

# ============================================================================
# NGINX CONFIGURATION
# ============================================================================
# Substitute DOMAIN_NAME in nginx config files
configure_nginx() {
    local app_dir="$1"
    local domain="$2"
    local nginx_dir="$app_dir/deployment/nginx"

    if [[ ! -d "$nginx_dir/sites-enabled" ]]; then
        print_warning "Nginx config directory not found: $nginx_dir/sites-enabled"
        return 0
    fi

    # Substitute ${DOMAIN_NAME} in all nginx config files
    find "$nginx_dir/sites-enabled" -type f -name "*.conf" -exec \
        sed -i "s/\${DOMAIN_NAME}/$domain/g" {} \;

    print_success "Nginx configured for domain: $domain"
}

# Generate self-signed SSL certificate for local/test deployments
generate_self_signed_ssl() {
    local domain="$1"
    local ssl_dir="$2"
    local cert_dir="$ssl_dir/live/$domain"

    print_step "Generating self-signed SSL certificate for $domain..."

    mkdir -p "$cert_dir"

    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "$cert_dir/privkey.pem" \
        -out "$cert_dir/fullchain.pem" \
        -subj "/C=US/ST=Test/L=Test/O=Test/CN=$domain" 2>/dev/null

    if [[ -f "$cert_dir/fullchain.pem" ]]; then
        print_success "Self-signed certificate generated for $domain"
        return 0
    else
        print_error "Failed to generate self-signed certificate"
        return 1
    fi
}

# ============================================================================
# VERIFICATION FUNCTIONS
# ============================================================================
# These functions verify that bootstrap steps are properly configured.
# Used by both bootstrap validation and timetiles check command.
# Return: 0 = OK, 1 = warning, 2 = error
# Output: Sets CHECK_MSG with details

# Check Ubuntu version
verify_ubuntu() {
    if [[ ! -f /etc/os-release ]]; then
        CHECK_MSG="Cannot detect OS"
        return 1
    fi
    source /etc/os-release
    if [[ "$ID" == "ubuntu" ]] && [[ "${VERSION_ID%%.*}" -ge 24 ]]; then
        CHECK_MSG="Ubuntu $VERSION_ID"
        return 0
    else
        CHECK_MSG="Expected Ubuntu 24.04+ (found: $ID $VERSION_ID)"
        return 1
    fi
}

# Check swap configuration
verify_swap() {
    local swap_size
    swap_size=$(free -m | awk '/^Swap:/ {print $2}')
    if [[ "$swap_size" -ge 1024 ]]; then
        CHECK_MSG="Swap configured (${swap_size}MB)"
        return 0
    elif [[ "$swap_size" -gt 0 ]]; then
        CHECK_MSG="Swap is small (${swap_size}MB, recommend 2GB+)"
        return 1
    else
        CHECK_MSG="No swap configured"
        return 1
    fi
}

# Check UFW firewall
verify_ufw() {
    if ! command -v ufw &>/dev/null; then
        CHECK_MSG="UFW not installed"
        return 2
    fi
    if ! sudo ufw status 2>/dev/null | grep -q "Status: active"; then
        CHECK_MSG="UFW not active"
        return 2
    fi
    # Check required ports
    local ufw_rules
    ufw_rules=$(sudo ufw status 2>/dev/null)
    for port in 22 80 443; do
        if ! echo "$ufw_rules" | grep -qE "^$port(/tcp)?\s+ALLOW"; then
            CHECK_MSG="UFW enabled but missing port $port"
            return 1
        fi
    done
    CHECK_MSG="UFW enabled (ports: 22, 80, 443)"
    return 0
}

# Check SSH hardening
verify_ssh_hardening() {
    local sshd_config="/etc/ssh/sshd_config"
    if [[ ! -f "$sshd_config" ]]; then
        CHECK_MSG="Cannot check SSH config"
        return 1
    fi
    local issues=""
    if grep -qE "^PasswordAuthentication\s+yes" "$sshd_config" 2>/dev/null; then
        issues="password auth enabled"
    fi
    if grep -qE "^PermitRootLogin\s+yes" "$sshd_config" 2>/dev/null; then
        issues="${issues:+$issues, }root login enabled"
    fi
    if [[ -z "$issues" ]]; then
        CHECK_MSG="SSH hardened (password auth disabled, root login disabled)"
        return 0
    else
        CHECK_MSG="SSH not fully hardened: $issues"
        return 1
    fi
}

# Check fail2ban
verify_fail2ban() {
    if ! command -v fail2ban-client &>/dev/null; then
        CHECK_MSG="fail2ban not installed"
        return 2
    fi
    if ! systemctl is-active --quiet fail2ban 2>/dev/null; then
        CHECK_MSG="fail2ban not running"
        return 2
    fi
    local jails
    jails=$(sudo fail2ban-client status 2>/dev/null | grep "Jail list" | cut -d: -f2 | tr -d ' \t')
    if [[ -n "$jails" ]]; then
        CHECK_MSG="fail2ban running (jails: $jails)"
        return 0
    else
        CHECK_MSG="fail2ban running but no jails configured"
        return 1
    fi
}

# Check Docker
verify_docker() {
    if ! docker info &>/dev/null 2>&1; then
        CHECK_MSG="Docker daemon not accessible"
        return 2
    fi
    local version
    version=$(docker version --format '{{.Server.Version}}' 2>/dev/null)
    CHECK_MSG="Docker daemon running (v$version)"
    return 0
}

# Check Docker Compose
verify_docker_compose() {
    if ! docker compose version &>/dev/null 2>&1; then
        CHECK_MSG="Docker Compose not available"
        return 2
    fi
    local version
    version=$(docker compose version --short 2>/dev/null)
    CHECK_MSG="Docker Compose available (v$version)"
    return 0
}

# Check user in docker group
verify_docker_group() {
    if groups 2>/dev/null | grep -q docker; then
        CHECK_MSG="User in docker group"
        return 0
    else
        CHECK_MSG="User not in docker group"
        return 1
    fi
}

# Check backup cron
verify_backup_cron() {
    if crontab -l 2>/dev/null | grep -q "timetiles backup"; then
        CHECK_MSG="Backup cron configured"
        return 0
    else
        CHECK_MSG="Backup cron not configured"
        return 1
    fi
}

# Check log rotation
verify_log_rotation() {
    if [[ -f /etc/logrotate.d/timetiles ]] || [[ -f /etc/logrotate.d/docker-container ]]; then
        CHECK_MSG="Log rotation configured"
        return 0
    else
        CHECK_MSG="Log rotation not configured"
        return 1
    fi
}

# Check alerting
verify_alerting() {
    local alert_script="${1:-/opt/timetiles/scripts/alert.sh}"
    if [[ -x "$alert_script" ]]; then
        CHECK_MSG="Alerting configured"
        return 0
    else
        CHECK_MSG="Alerting not configured"
        return 1
    fi
}
