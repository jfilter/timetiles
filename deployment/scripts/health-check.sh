#!/bin/bash
# TimeTiles Health Check Script
# Restarts the application if health check fails and sends alerts

HEALTH_URL="http://localhost/api/health"
MAX_FAILURES=3
FAILURE_COUNT_FILE="/var/lib/timetiles/.health-failures"
ALERT_SCRIPT="/opt/timetiles/scripts/alert.sh"

# Initialize failure count
if [[ ! -f "$FAILURE_COUNT_FILE" ]]; then
    echo "0" > "$FAILURE_COUNT_FILE"
fi

# Check health
if curl -sf --max-time 10 "$HEALTH_URL" >/dev/null 2>&1; then
    # Health check passed - reset counter
    echo "0" > "$FAILURE_COUNT_FILE"
    exit 0
fi

# Health check failed - increment counter
failures=$(cat "$FAILURE_COUNT_FILE")
failures=$((failures + 1))
echo "$failures" > "$FAILURE_COUNT_FILE"

logger -t timetiles "Health check failed (attempt $failures of $MAX_FAILURES)"

if [[ $failures -ge $MAX_FAILURES ]]; then
    logger -t timetiles "Max failures reached, restarting services"

    # Check cooldown to prevent restart loops
    COOLDOWN_FILE="/var/lib/timetiles/.last-restart"
    if [[ -f "$COOLDOWN_FILE" ]]; then
        last_restart=$(cat "$COOLDOWN_FILE")
        now=$(date +%s)
        if (( now - last_restart < 600 )); then
            logger -t timetiles "Restart cooldown active (last restart ${last_restart}), skipping"
            exit 1
        fi
    fi

    # Send alert before restart
    if [[ -x "$ALERT_SCRIPT" ]]; then
        "$ALERT_SCRIPT" "Health Check Failed" \
            "TimeTiles health check failed $MAX_FAILURES times in a row. Service is being restarted automatically."
    fi

    systemctl restart timetiles.service
    date +%s > "$COOLDOWN_FILE"
    echo "0" > "$FAILURE_COUNT_FILE"
fi

# Check scraper runner (if configured as a systemd service)
if systemctl is-active --quiet timescrape-runner.service 2>/dev/null; then
    if ! curl -sf --max-time 5 "http://localhost:4000/health" >/dev/null 2>&1; then
        logger -t timescrape "Scraper runner health check failed, restarting"
        systemctl restart timescrape-runner.service
    fi
fi
