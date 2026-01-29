#!/bin/bash
# TimeTiles Bootstrap - Step 05: Clone Repository
# Clones TimeTiles deployment files to installation directory

run_step() {
    local repo_url="${REPO_URL:-https://github.com/jfilter/timetiles.git}"
    local repo_branch="${REPO_BRANCH:-main}"
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local user="${APP_USER:-timetiles}"
    local skip_clone="${SKIP_CLONE:-false}"

    # Check if we should skip cloning (local files already present)
    if [[ "$skip_clone" == "true" ]]; then
        if [[ -f "$install_dir/timetiles" ]]; then
            print_info "Skipping clone - local files already present"
            chown -R "$user:$user" "$install_dir"
            print_success "Repository setup complete (using local files)"
            return 0
        else
            print_warning "SKIP_CLONE=true but no files found at $install_dir"
            print_info "Falling back to cloning from repository..."
        fi
    fi

    print_step "Cloning deployment files..."
    print_info "URL: $repo_url"
    print_info "Branch: $repo_branch"
    print_info "Target: $install_dir"

    # Use temp directory for sparse checkout, then move contents
    local temp_dir=$(mktemp -d)

    # Sparse checkout - only deployment folder
    print_step "Cloning deployment files only (sparse checkout)..."
    cd "$temp_dir" || die "Cannot change to temp dir"

    git init -q
    git remote add origin "$repo_url"
    git config core.sparseCheckout true
    echo "deployment/" > .git/info/sparse-checkout

    retry 3 5 git fetch --depth 1 origin "$repo_branch"
    git checkout -q "$repo_branch"

    # Move deployment contents to install dir (flatten structure)
    print_step "Installing to $install_dir..."

    # Ensure install dir exists and is empty (except for scripts dir which may exist)
    mkdir -p "$install_dir"

    # Copy deployment contents directly to install dir
    cp -r "$temp_dir/deployment/"* "$install_dir/"

    # Clean up temp dir
    rm -rf "$temp_dir"

    # Set ownership
    chown -R "$user:$user" "$install_dir"

    print_success "Deployment files installed"

    # Verify critical files exist
    print_step "Verifying deployment structure..."

    local required_files=(
        "timetiles"
        "docker-compose.prod.yml"
        ".env.production.example"
    )

    for file in "${required_files[@]}"; do
        if [[ ! -f "$install_dir/$file" ]]; then
            die "Missing required file: $file"
        fi
    done

    print_success "Deployment structure verified"
    chmod +x "$install_dir/timetiles"
    print_success "Deployment files ready"
}
