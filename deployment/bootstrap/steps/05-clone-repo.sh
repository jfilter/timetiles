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
            ensure_install_dirs "$install_dir" "$user"
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
            # Bundled data-package manifests + the timetiles.example.yml
            # template. Tiny dir, but lets `git pull` deliver new packages.
            echo "apps/web/config/"
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
        # Carry the operator's state into the new tree BEFORE the swap — the
        # .old dir is rm -rf'd at the end of this step.
        preserve_operator_state "${src_dir}.old" "$new_dir"
    fi
    mv "$new_dir" "$src_dir"

    ensure_symlink "$install_dir" "$src_dir"

    chown -R "$user:$user" "$src_dir"

    ensure_install_dirs "$install_dir" "$user"

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

# Move the operator's gitignored state from the outgoing tree into the fresh
# clone.
#
# A fresh clone contains only TRACKED files. Everything the operator owns is
# gitignored by design and therefore absent from it: .env.production (the DB
# password and PAYLOAD_SECRET — the only copy that exists, since step 06
# deliberately keeps secrets out of the state file), credentials.txt, uploads/,
# backups/, exports/, ssl/, logs/, data/, the scraper-runner/ dir, and
# apps/web/config/timetiles.yml.
#
# Before this, a re-clone moved the old tree to .old and then `rm -rf`'d it,
# destroying all of the above in one step. That path is not hypothetical: it is
# exactly what `bootstrap.sh --force` does, since completed steps are otherwise
# skipped.
#
# The list comes from git rather than being hardcoded, so it tracks .gitignore
# as that evolves and correctly spans BOTH ignore files that matter here — the
# repo root's (which is what covers apps/web/config/timetiles.yml) and
# deployment/'s.
preserve_operator_state() {
    local old_dir="$1"
    local new_dir="$2"
    local rel

    [[ -d "$old_dir" ]] || return 0

    while IFS= read -r rel; do
        [[ -n "$rel" ]] || continue
        rel="${rel%/}"

        [[ -e "$old_dir/$rel" ]] || continue
        # Never shadow something the fresh clone legitimately ships.
        [[ -e "$new_dir/$rel" ]] && continue

        mkdir -p "$(dirname "$new_dir/$rel")"
        if mv "$old_dir/$rel" "$new_dir/$rel"; then
            print_info "Preserved $rel"
        else
            print_warning "Could not preserve $rel — a copy remains in $old_dir"
        fi
    done < <(list_operator_paths "$old_dir")
}

# Enumerate the gitignored (operator-owned) paths of a tree, repo-relative.
#
# Listed per FILE, deliberately without `--directory`. That flag collapses an
# ignored directory into a single entry, and the caller skips any entry the
# fresh clone already has — so a collapsed `deployment/config/` would be
# skipped wholesale (the clone ships a tracked timetiles.example.yml there)
# and the operator's timetiles.yml inside it would be dropped. Per-file
# entries merge into existing directories instead of colliding with them.
list_operator_paths() {
    local old_dir="$1"

    if [[ -d "$old_dir/.git" ]]; then
        git -c core.quotePath=false -C "$old_dir" ls-files \
            --others --ignored --exclude-standard 2>/dev/null \
            && return 0
    fi

    # No git metadata (e.g. a SKIP_CLONE tree mounted from a host). Fall back to
    # the paths whose loss is unrecoverable. Keep in sync with deployment/.gitignore.
    printf '%s\n' \
        "deployment/.env.production" \
        "deployment/.env.production.local" \
        "deployment/.env.production.overrides" \
        "deployment/credentials.txt" \
        "deployment/docker-compose.override.yml" \
        "deployment/backups" \
        "deployment/uploads" \
        "deployment/exports" \
        "deployment/ssl" \
        "deployment/data" \
        "deployment/logs" \
        "deployment/scraper-runner" \
        "deployment/config/timetiles.yml" \
        "apps/web/config/timetiles.yml"
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
The current bootstrap expects $install_dir to be a symlink into $src_dir.
If this is a flat install from an older bootstrap, back it up and remove it
so the bootstrap can take over."
    fi

    ln -sfn "$target" "$install_dir"
}

# Create the runtime directories that live inside the install dir. Must run
# after ensure_symlink — before it, $install_dir does not exist at all.
#
# Only .gitignored directories belong here: $install_dir resolves into a real
# git working tree, so anything created here that is tracked (or untracked and
# not ignored) would show up in `git status` and break `timetiles update`.
ensure_install_dirs() {
    local install_dir="$1"
    local user="$2"

    ensure_dir "$install_dir/backups" "$user:$user" 750
}
