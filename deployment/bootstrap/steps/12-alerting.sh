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

    # alert.sh ships as a tracked file in deployment/scripts/ so that
    # `timetiles update` (git fetch + reset --hard) restores it instead of
    # losing it (see 09-monitoring.sh for the history).
    print_step "Checking alert script..."
    if [[ ! -f "$scripts_dir/alert.sh" ]]; then
        print_error "Missing $scripts_dir/alert.sh — deployment/scripts/ is tracked in git; restore with: git checkout -- scripts/"
        return 1
    fi
    chmod +x "$scripts_dir/alert.sh"
    print_info "Alert script present: $scripts_dir/alert.sh"

    # Create log directory and file with proper permissions
    mkdir -p /var/log/timetiles && touch /var/log/timetiles/alerts.log
    chmod 640 /var/log/timetiles/alerts.log

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
