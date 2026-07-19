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
        # --no-create-home is deliberate: $home is INSTALL_DIR, which step 05
        # turns into a symlink to ${INSTALL_DIR}-src/deployment. useradd -m
        # would materialize it as a real directory first, and ensure_symlink
        # refuses to replace one.
        useradd \
            --system \
            --shell /bin/bash \
            --no-create-home \
            --home-dir "$home" \
            "$user"
        print_success "Created user: $user"
    fi

    # Add user to docker group
    print_step "Adding $user to docker group..."
    usermod -aG docker "$user"
    print_success "User $user added to docker group"

    # Create required directories
    #
    # Only directories OUTSIDE the install dir belong here. $home itself and
    # anything under it are created by step 05, after the symlink exists —
    # see ensure_install_dirs there.
    print_step "Creating application directories..."

    # State directory (for bootstrap state)
    ensure_dir "/var/lib/timetiles" "root:root" 755

    # Log directory
    ensure_dir "/var/log/timetiles" "$user:$user" 755

    print_success "Application user and directories configured"
}
