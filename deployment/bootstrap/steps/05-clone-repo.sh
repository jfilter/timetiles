#!/bin/bash
# TimeTiles Bootstrap - Step 05: Clone Repository
# Clones TimeTiles repository to installation directory

run_step() {
    local repo_url="${REPO_URL:-https://github.com/jfilter/timetiles.git}"
    local repo_branch="${REPO_BRANCH:-main}"
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local app_dir="$install_dir/app"
    local user="${APP_USER:-timetiles}"
    local skip_clone="${SKIP_CLONE:-false}"

    # Check if we should skip cloning (local files already present)
    if [[ "$skip_clone" == "true" ]]; then
        if [[ -d "$app_dir" ]] && [[ -f "$app_dir/package.json" ]]; then
            print_info "Skipping clone - local files already present"
            # Just fix ownership
            chown -R "$user:$user" "$app_dir"
            print_success "Repository setup complete (using local files)"
            return 0
        else
            print_warning "SKIP_CLONE=true but no files found at $app_dir"
            print_info "Falling back to cloning from repository..."
        fi
    fi

    print_step "Cloning repository..."
    print_info "URL: $repo_url"
    print_info "Branch: $repo_branch"
    print_info "Target: $app_dir"

    # Check if already cloned
    if [[ -d "$app_dir/.git" ]]; then
        print_info "Repository already exists, updating..."

        # Update existing repository
        cd "$app_dir" || die "Cannot change to $app_dir"

        # Fetch and checkout
        sudo -u "$user" git fetch origin
        sudo -u "$user" git checkout "$repo_branch"
        sudo -u "$user" git pull origin "$repo_branch"

        print_success "Repository updated"
    else
        # Remove directory if it exists but isn't a git repo
        if [[ -d "$app_dir" ]]; then
            rm -rf "$app_dir"
        fi

        # Clone repository
        print_step "Cloning fresh copy..."
        retry 3 5 git clone --branch "$repo_branch" "$repo_url" "$app_dir"

        # Set ownership
        chown -R "$user:$user" "$app_dir"

        print_success "Repository cloned"
    fi

    # Verify critical files exist
    print_step "Verifying repository structure..."

    local required_files=(
        "deployment/deploy.sh"
        "deployment/docker-compose.prod.yml"
        "deployment/.env.production.example"
    )

    for file in "${required_files[@]}"; do
        if [[ ! -f "$app_dir/$file" ]]; then
            die "Missing required file: $file"
        fi
    done

    print_success "Repository structure verified"

    # Make deploy.sh executable
    chmod +x "$app_dir/deployment/deploy.sh"

    # Initialize Git LFS and pull files
    if check_command git-lfs; then
        print_step "Initializing Git LFS and pulling files..."
        cd "$app_dir" || die "Cannot change to $app_dir"
        sudo -u "$user" git lfs install --local
        sudo -u "$user" git lfs pull
        print_success "Git LFS files pulled"
    else
        print_warning "git-lfs not installed - binary assets may be missing"
    fi

    print_success "Repository setup complete"
}
