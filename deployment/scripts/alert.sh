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
            EMAIL_SMTP_HOST|EMAIL_SMTP_PORT|EMAIL_FROM|ALERT_EMAIL|LETSENCRYPT_EMAIL|DOMAIN_NAME|EMAIL_SMTP_USER|EMAIL_SMTP_PASS)
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
    echo "[$(date)] Alert: $SUBJECT - $MESSAGE" >> /var/log/timetiles/alerts.log
    echo "Warning: SMTP not configured, alert logged to /var/log/timetiles/alerts.log"
    exit 0
fi

# Build curl SMTP command with optional auth and TLS
CURL_ARGS=(--silent --max-time 30)
CURL_ARGS+=(--mail-from "$EMAIL_FROM")
CURL_ARGS+=(--mail-rcpt "$ALERT_EMAIL")

# Use SMTPS for port 465, STARTTLS for others
if [[ "$EMAIL_SMTP_PORT" == "465" ]]; then
    CURL_ARGS+=(--url "smtps://$EMAIL_SMTP_HOST:$EMAIL_SMTP_PORT")
else
    CURL_ARGS+=(--url "smtp://$EMAIL_SMTP_HOST:$EMAIL_SMTP_PORT" --ssl-reqd)
fi

# Add authentication if credentials are available
if [[ -n "${EMAIL_SMTP_USER:-}" ]] && [[ -n "${EMAIL_SMTP_PASS:-}" ]]; then
    CURL_ARGS+=(--user "$EMAIL_SMTP_USER:$EMAIL_SMTP_PASS")
fi

curl "${CURL_ARGS[@]}" \
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
    echo "[$(date)] FAILED to send alert: $SUBJECT - $MESSAGE" >> /var/log/timetiles/alerts.log
    echo "Warning: Failed to send alert, logged to /var/log/timetiles/alerts.log"
    exit 1
}
