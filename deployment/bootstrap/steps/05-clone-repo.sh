#!/bin/bash
# TimeTiles Bootstrap - Step 05: Clone Repository
#
# Clones the repo into ${INSTALL_DIR}-src as a real git working tree
# (sparse-checkout: deployment/), then symlinks ${INSTALL_DIR} →
# ${INSTALL_DIR}-src/deployment. This shape lets `timetiles update` use
# `git pull` to refresh tracked files (compose, nginx, init-db, the CLI
# itself) — operator state stays in .gitignored files inside deployment/.

run_step() {
    local repo_url="${REPO_URL:-https://github.com/jfilter/timetiles.git}"
    local repo_branch="${REPO_BRANCH:-main}"
    local install_dir="${INSTALL_DIR:-/opt/timetiles}"
    local src_dir="${install_dir}-src"
    local user="${APP_USER:-timetiles}"
    local skip_clone="${SKIP_CLONE:-false}"

    # SKIP_CLONE: local files already present (typically a VM test that
    # mounts /opt/timetiles-src from the host). Just ensure the symlink
    # is in place and ownership is correct.
    if [[ "$skip_clone" == "true" ]]; then
        if [[ -d "$src_dir/deployment" ]] || [[ -f "$install_dir/timetiles" ]]; then
            print_info "Skipping clone - local files already present"
            ensure_symlink "$install_dir" "$src_dir"
            chown -R "$user:$user" "$src_dir" 2>/dev/null || true
            print_success "Repository setup complete (using local files)"
            return 0
        fi
        print_warning "SKIP_CLONE=true but no files found at $src_dir or $install_dir"
        print_info "Falling back to cloning from repository..."
    fi

    print_step "Cloning deployment files..."
    print_info "URL: $repo_url"
    print_info "Branch: $repo_branch"
    print_info "Source: $src_dir"
    print_info "Symlink: $install_dir -> $src_dir/deployment"

    # Clone into a sibling .new dir, then atomic rename — keeps the previous
    # install bootable until the new one is fully assembled.
    local new_dir="${src_dir}.new"
    rm -rf "$new_dir"
    mkdir -p "$new_dir"

    (
        cd "$new_dir" || die "Cannot change to $new_dir"
        git init -q
        git remote add origin "$repo_url"
        git config core.sparseCheckout true
        {
            echo "deployment/"
            if [[ "${SKIP_SCRAPER:-true}" != "true" ]]; then
                echo "apps/timescrape/"
            fi
        } > .git/info/sparse-checkout

        retry 3 5 git fetch --depth 1 origin "$repo_branch"
        git checkout -q -B "$repo_branch" "origin/$repo_branch"
    ) || die "Failed to clone deployment files"

    # If a previous src dir exists, swap it aside so we can rollback.
    if [[ -d "$src_dir" ]]; then
        rm -rf "${src_dir}.old"
        mv "$src_dir" "${src_dir}.old"
    fi
    mv "$new_dir" "$src_dir"

    ensure_symlink "$install_dir" "$src_dir"

    chown -R "$user:$user" "$src_dir"

    print_success "Deployment files installed"

    print_step "Verifying deployment structure..."
    local required_files=(
        "timetiles"
        "docker-compose.prod.yml"
        ".env.production.example"
    )
    for file in "${required_files[@]}"; do
        if [[ ! -f "$install_dir/$file" ]]; then
            die "Missing required file: $install_dir/$file"
        fi
    done

    chmod +x "$install_dir/timetiles"

    # Drop the rollback dir on success.
    rm -rf "${src_dir}.old"

    print_success "Deployment files ready"
}

# Idempotently point $install_dir at $src_dir/deployment.
# If $install_dir is already a symlink, retarget it. If it is a plain
# directory, refuse and tell the operator to migrate explicitly.
ensure_symlink() {
    local install_dir="$1"
    local src_dir="$2"
    local target="$src_dir/deployment"

    if [[ -L "$install_dir" ]]; then
        # Existing symlink — retarget if needed.
        ln -sfn "$target" "$install_dir"
        return 0
    fi

    if [[ -e "$install_dir" ]]; then
        die "$install_dir already exists as a regular directory.
Run deployment/scripts/migrate-to-source-layout.sh to convert a flat install."
    fi

    ln -sfn "$target" "$install_dir"
}
