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
        if [[ -d "$app_dir" ]] && [[ -f "$app_dir/deployment/deploy.sh" ]]; then
            print_info "Skipping clone - local files already present"
            chown -R "$user:$user" "$app_dir"
            print_success "Repository setup complete (using local files)"
            return 0
        else
            print_warning "SKIP_CLONE=true but no files found at $app_dir"
            print_info "Falling back to cloning from repository..."
        fi
    fi

    print_step "Cloning deployment files..."
    print_info "URL: $repo_url"
    print_info "Branch: $repo_branch"
    print_info "Target: $app_dir"

    # Check if already cloned
    if [[ -d "$app_dir/.git" ]]; then
        print_info "Repository already exists, updating..."
        cd "$app_dir" || die "Cannot change to $app_dir"
        sudo -u "$user" git fetch origin
        sudo -u "$user" git checkout "$repo_branch"
        sudo -u "$user" git pull origin "$repo_branch"
        print_success "Repository updated"
    else
        # Remove directory if it exists but isn't a git repo
        if [[ -d "$app_dir" ]]; then
            rm -rf "$app_dir"
        fi

        # Sparse checkout - only deployment folder
        print_step "Cloning deployment files only (sparse checkout)..."
        mkdir -p "$app_dir"
        cd "$app_dir" || die "Cannot change to $app_dir"

        git init
        git remote add origin "$repo_url"
        git config core.sparseCheckout true
        echo "deployment/" > .git/info/sparse-checkout

        retry 3 5 git fetch --depth 1 origin "$repo_branch"
        git checkout "$repo_branch"

        chown -R "$user:$user" "$app_dir"
        print_success "Deployment files cloned"
    fi

    # Verify critical files exist
    print_step "Verifying deployment structure..."

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

    print_success "Deployment structure verified"
    chmod +x "$app_dir/deployment/deploy.sh"
    print_success "Deployment files ready"
}
