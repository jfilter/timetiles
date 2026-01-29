#!/bin/bash
# TimeTiles Bootstrap - Step 12: Email Alerting Setup
# Installs alert script that reuses app SMTP config

run_step() {
    # Check if alerting should be skipped
    if [[ "${SKIP_ALERTING:-false}" == "true" ]]; then
        print_skip "Alerting setup skipped (SKIP_ALERTING=true)"
        return 0
    fi

    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local scripts_dir="$install_dir/scripts"

    print_step "Setting up email alerting..."

    # Create scripts directory if it doesn't exist
    mkdir -p "$scripts_dir"

    # Create the alert script
    print_step "Creating alert script..."
    cat > "$scripts_dir/alert.sh" << 'ALERT_SCRIPT'
#!/bin/bash
# TimeTiles Alert Script
# Sends email alerts using app SMTP config
# Usage: alert.sh "Subject" "Message body"

set -euo pipefail

SUBJECT="${1:-Alert}"
MESSAGE="${2:-No message provided}"

# Load environment from .env.production
ENV_FILE="/opt/timetiles/.env.production"
if [[ -f "$ENV_FILE" ]]; then
    # Extract EMAIL and ALERT variables
    while IFS='=' read -r key value; do
        case "$key" in
            EMAIL_SMTP_HOST|EMAIL_SMTP_PORT|EMAIL_FROM|ALERT_EMAIL|LETSENCRYPT_EMAIL|DOMAIN_NAME)
                # Remove quotes if present
                value="${value%\"}"
                value="${value#\"}"
                export "$key=$value"
                ;;
        esac
    done < <(grep -E '^(EMAIL_|ALERT_|LETSENCRYPT_|DOMAIN_)' "$ENV_FILE" 2>/dev/null || true)
fi

# Set defaults
ALERT_EMAIL="${ALERT_EMAIL:-${LETSENCRYPT_EMAIL:-admin@localhost}}"
EMAIL_FROM="${EMAIL_FROM:-noreply@${DOMAIN_NAME:-localhost}}"
EMAIL_SMTP_HOST="${EMAIL_SMTP_HOST:-localhost}"
EMAIL_SMTP_PORT="${EMAIL_SMTP_PORT:-587}"
HOSTNAME=$(hostname -f 2>/dev/null || hostname)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Skip if no SMTP host configured
if [[ "$EMAIL_SMTP_HOST" == "localhost" ]] || [[ -z "$EMAIL_SMTP_HOST" ]]; then
    echo "[$(date)] Alert: $SUBJECT - $MESSAGE" >> /var/log/timetiles-alerts.log
    echo "Warning: SMTP not configured, alert logged to /var/log/timetiles-alerts.log"
    exit 0
fi

# Send via curl SMTP
curl --silent --max-time 30 \
     --url "smtp://$EMAIL_SMTP_HOST:$EMAIL_SMTP_PORT" \
     --mail-from "$EMAIL_FROM" \
     --mail-rcpt "$ALERT_EMAIL" \
     -T <(cat <<EOF
From: TimeTiles <$EMAIL_FROM>
To: $ALERT_EMAIL
Subject: [TimeTiles] $SUBJECT
Content-Type: text/plain; charset=utf-8

$MESSAGE

---
Server: $HOSTNAME
Time: $TIMESTAMP
EOF
) && echo "Alert sent to $ALERT_EMAIL" || {
    echo "[$(date)] FAILED to send alert: $SUBJECT - $MESSAGE" >> /var/log/timetiles-alerts.log
    echo "Warning: Failed to send alert, logged to /var/log/timetiles-alerts.log"
    exit 1
}
ALERT_SCRIPT

    chmod +x "$scripts_dir/alert.sh"
    print_info "Created $scripts_dir/alert.sh"

    # Create a simple log file with proper permissions
    touch /var/log/timetiles-alerts.log
    chmod 644 /var/log/timetiles-alerts.log

    # Test the alert script (dry run - just validate it can parse config)
    print_step "Validating alert script..."
    if bash -n "$scripts_dir/alert.sh"; then
        print_success "Alert script syntax valid"
    else
        print_warning "Alert script has syntax errors"
    fi

    # Check if SMTP is configured
    if [[ -f "$install_dir/.env.production" ]]; then
        local smtp_host
        smtp_host=$(grep "^EMAIL_SMTP_HOST=" "$install_dir/.env.production" 2>/dev/null | cut -d= -f2 || echo "")
        if [[ -n "$smtp_host" ]] && [[ "$smtp_host" != "localhost" ]] && [[ "$smtp_host" != "smtp.example.com" ]]; then
            print_success "SMTP configured: $smtp_host"
        else
            print_warning "SMTP not configured - alerts will be logged to file only"
            print_info "Configure EMAIL_SMTP_HOST in .env.production to enable email alerts"
        fi
    fi

    print_success "Alerting setup complete"
    print_info "Usage: $scripts_dir/alert.sh \"Subject\" \"Message\""
}
