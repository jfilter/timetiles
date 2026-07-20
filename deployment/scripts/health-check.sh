#!/bin/bash
# TimeTiles Health Check Script
# Restarts the application if health check fails and sends alerts

HEALTH_URL="http://localhost/api/health"
MAX_FAILURES=3
FAILURE_COUNT_FILE="/var/lib/timetiles/.health-failures"
ALERT_SCRIPT="/opt/timetiles/scripts/alert.sh"

# Both subsystems are checked on every run, and each reports through its own
# exit status rather than ending the script. They used to exit directly, which
# meant the scraper was only ever probed in the narrow window where the web app
# was ALSO failing but still below its restart threshold -- so on a healthy
# host, the runner was never checked at all.
STATUS=0

check_web() {

# Initialize failure count
if [[ ! -f "$FAILURE_COUNT_FILE" ]]; then
    echo "0" > "$FAILURE_COUNT_FILE"
fi

# Check health
if curl -sf --max-time 10 "$HEALTH_URL" >/dev/null 2>&1; then
    # Health check passed - reset counter
    echo "0" > "$FAILURE_COUNT_FILE"
    return 0
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
            return 1
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

return 1
}

check_scraper() {

# Check scraper runner (if configured as a systemd service)
SCRAPER_FAILURE_COUNT_FILE="/var/lib/timetiles/.scraper-health-failures"
SCRAPER_COOLDOWN_FILE="/var/lib/timetiles/.scraper-last-restart"

# The scraper is optional. A host without it is healthy, not failing -- without
# this the function would fall through to its closing `return 1` and report a
# failure on every run.
if ! systemctl is-active --quiet timescrape-runner.service 2>/dev/null; then
    return 0
fi

if [[ ! -f "$SCRAPER_FAILURE_COUNT_FILE" ]]; then
    echo "0" > "$SCRAPER_FAILURE_COUNT_FILE"
fi

if curl -sf --max-time 5 "http://localhost:4000/health" >/dev/null 2>&1; then
    echo "0" > "$SCRAPER_FAILURE_COUNT_FILE"
    return 0
fi

scraper_failures=$(cat "$SCRAPER_FAILURE_COUNT_FILE")
scraper_failures=$((scraper_failures + 1))
echo "$scraper_failures" > "$SCRAPER_FAILURE_COUNT_FILE"

logger -t timescrape "Scraper runner health check failed (attempt $scraper_failures of $MAX_FAILURES)"

if [[ $scraper_failures -ge $MAX_FAILURES ]]; then
    # A runner that is broken rather than briefly wedged fails every probe, and
    # restarting it on each one bounces it every 5 minutes indefinitely with no
    # trace beyond journal lines nobody reads. Same counter, cooldown and alert
    # as the web path above, so a permanently dead runner reaches a human.
    if [[ -f "$SCRAPER_COOLDOWN_FILE" ]]; then
        scraper_last_restart=$(cat "$SCRAPER_COOLDOWN_FILE")
        now=$(date +%s)
        if (( now - scraper_last_restart < 600 )); then
            logger -t timescrape "Scraper restart cooldown active (last restart ${scraper_last_restart}), skipping"
            return 1
        fi
    fi

    logger -t timescrape "Max failures reached, restarting scraper runner"

    # Alert before restart - a restart that fixes it still means it broke.
    if [[ -x "$ALERT_SCRIPT" ]]; then
        "$ALERT_SCRIPT" "Scraper Runner Health Check Failed" \
            "TimeScrape runner health check failed $MAX_FAILURES times in a row. Runner is being restarted automatically."
    fi

    systemctl restart timescrape-runner.service
    date +%s > "$SCRAPER_COOLDOWN_FILE"
    echo "0" > "$SCRAPER_FAILURE_COUNT_FILE"
fi

return 1
}

check_web || STATUS=1
check_scraper || STATUS=1
exit $STATUS
