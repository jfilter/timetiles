#!/bin/bash
# TimeTiles Bootstrap - Step 04: Application User
# Creates dedicated user and directories for TimeTiles

run_step() {
    local user="${APP_USER:-timetiles}"
    local home="${INSTALL_DIR:-/opt/timetiles}"

    print_step "Creating application user: $user"

    # Create user if doesn't exist
    if id "$user" &>/dev/null; then
        print_info "User $user already exists"
    else
        useradd \
            --system \
            --shell /bin/bash \
            --create-home \
            --home-dir "$home" \
            "$user"
        print_success "Created user: $user"
    fi

    # Add user to docker group
    print_step "Adding $user to docker group..."
    usermod -aG docker "$user"
    print_success "User $user added to docker group"

    # Create required directories
    print_step "Creating application directories..."

    # Main application directory
    ensure_dir "$home" "$user:$user" 755
    ensure_dir "$home/app" "$user:$user" 755
    ensure_dir "$home/scripts" "$user:$user" 755
    ensure_dir "$home/backups" "$user:$user" 750

    # State directory (for bootstrap state)
    ensure_dir "/var/lib/timetiles" "root:root" 755

    # Log directory
    ensure_dir "/var/log/timetiles" "$user:$user" 755

    print_success "Application user and directories configured"
}
