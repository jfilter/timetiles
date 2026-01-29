#!/bin/bash
# TimeTiles Bootstrap - Step 09: Monitoring Setup
# Configures health checks, backups, log rotation, and systemd service

run_step() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local user="${APP_USER:-timetiles}"

    # Create health check script
    create_health_check_script

    # Set up cron jobs
    setup_cron_jobs

    # Configure log rotation
    setup_log_rotation

    # Create systemd service
    create_systemd_service

    # Create CLI symlink
    create_cli_symlink

    # Print final summary
    print_final_summary

    print_success "Monitoring setup complete"
}

create_health_check_script() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local script="$install_dir/scripts/health-check.sh"

    print_step "Creating health check script..."

    cat > "$script" << 'EOF'
#!/bin/bash
# TimeTiles Health Check Script
# Restarts the application if health check fails and sends alerts

HEALTH_URL="http://localhost:3000/api/health"
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

    # Send alert before restart
    if [[ -x "$ALERT_SCRIPT" ]]; then
        "$ALERT_SCRIPT" "Health Check Failed" \
            "TimeTiles health check failed $MAX_FAILURES times in a row. Service is being restarted automatically."
    fi

    systemctl restart timetiles.service
    echo "0" > "$FAILURE_COUNT_FILE"
fi
EOF

    chmod +x "$script"
    chown root:root "$script"

    print_success "Health check script created: $script"
}

setup_cron_jobs() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local user="${APP_USER:-timetiles}"

    print_step "Setting up cron jobs..."

    cat > /etc/cron.d/timetiles << EOF
# TimeTiles Cron Jobs
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin

# Health check every 5 minutes
*/5 * * * * root $install_dir/scripts/health-check.sh

# Daily database backup at 2 AM
0 2 * * * $user $install_dir/timetiles backup db >> /var/log/timetiles/backup.log 2>&1

# Weekly full backup (Sunday at 3 AM)
0 3 * * 0 $user $install_dir/timetiles backup full >> /var/log/timetiles/backup.log 2>&1

# Monthly backup cleanup (1st of month at 4 AM)
0 4 1 * * $user $install_dir/timetiles backup clean >> /var/log/timetiles/backup.log 2>&1
EOF

    chmod 644 /etc/cron.d/timetiles

    print_success "Cron jobs configured"
    print_info "  - Health check: every 5 minutes"
    print_info "  - Database backup: daily at 2 AM"
    print_info "  - Full backup: weekly (Sunday 3 AM)"
    print_info "  - Cleanup: monthly (1st at 4 AM)"
}

setup_log_rotation() {
    print_step "Configuring log rotation..."

    cat > /etc/logrotate.d/timetiles << 'EOF'
/var/log/timetiles/*.log {
    daily
    missingok
    rotate 14
    compress
    delaycompress
    notifempty
    create 640 timetiles timetiles
    sharedscripts
    postrotate
        /bin/true
    endscript
}
EOF

    chmod 644 /etc/logrotate.d/timetiles

    print_success "Log rotation configured (14 days retention)"
}

create_systemd_service() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local user="${APP_USER:-timetiles}"

    print_step "Creating systemd service..."

    cat > /etc/systemd/system/timetiles.service << EOF
[Unit]
Description=TimeTiles Application
Documentation=https://github.com/jfilter/timetiles
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
User=$user
Group=$user
WorkingDirectory=$install_dir
ExecStart=$install_dir/timetiles up
ExecStop=$install_dir/timetiles down
ExecReload=$install_dir/timetiles restart
TimeoutStartSec=300
TimeoutStopSec=120
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable timetiles.service

    print_success "Systemd service created and enabled"
    print_info "  - Start: systemctl start timetiles"
    print_info "  - Stop: systemctl stop timetiles"
    print_info "  - Status: systemctl status timetiles"
}

create_cli_symlink() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"

    print_step "Creating CLI symlink..."

    # Create symlink to /usr/local/bin for system-wide access
    ln -sf "$install_dir/timetiles" /usr/local/bin/timetiles

    print_success "CLI symlink created: /usr/local/bin/timetiles"
    print_info "  You can now run 'timetiles' from anywhere"
}

print_final_summary() {
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"

    print_header "Bootstrap Complete!"

    echo -e "${GREEN}TimeTiles has been successfully deployed!${NC}"
    echo ""
    echo "Access your application:"
    echo "  - Website: https://$DOMAIN_NAME"
    echo "  - Admin Panel: https://$DOMAIN_NAME/admin"
    echo ""
    echo "Useful commands:"
    echo "  - View logs: timetiles logs"
    echo "  - Check status: timetiles status"
    echo "  - Create backup: timetiles backup"
    echo "  - Update app: timetiles update"
    echo "  - Full health check: timetiles check"
    echo ""
    echo "Credentials saved to: $install_dir/credentials.txt"
    echo ""
    echo "Next steps:"
    echo "  1. Visit https://$DOMAIN_NAME/admin to create your first admin user"
    echo "  2. Configure your datasets and start importing events"
    echo ""
}
