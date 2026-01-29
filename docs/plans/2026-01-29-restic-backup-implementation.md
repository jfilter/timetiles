# Restic Backup System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace current pg_dump/tar backup system with restic for encrypted, deduplicated backups with local and S3-compatible offsite storage.

**Architecture:** Use pg_dump for consistent database snapshots, then restic to store dumps and uploads with deduplication and encryption. Support local repo (fast restores) and optional S3-compatible offsite (disaster recovery). Handle write-only S3 credentials gracefully.

**Tech Stack:** restic, bash, pg_dump, Docker, S3-compatible storage

---

## Task 1: Add restic to Bootstrap System Setup

**Files:**
- Modify: `deployment/bootstrap/steps/01-system-setup.sh:14-29`

**Step 1: Add restic to apt packages**

Add `restic` to the apt-get install list in step 01:

```bash
    apt-get install -y -qq \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg \
        lsb-release \
        software-properties-common \
        git \
        git-lfs \
        make \
        jq \
        openssl \
        dnsutils \
        fail2ban \
        unattended-upgrades \
        logrotate \
        restic
```

**Step 2: Verify installation**

Run in a test environment or check package exists:
```bash
apt-cache show restic | head -5
```
Expected: Package info with version 0.15+ (Ubuntu 24.04 has restic in repos)

**Step 3: Commit**

```bash
git add deployment/bootstrap/steps/01-system-setup.sh
git commit -m "feat(deploy): add restic to bootstrap packages"
```

---

## Task 2: Add Restic Config Variables

**Files:**
- Modify: `deployment/bootstrap/bootstrap.conf.example`
- Modify: `deployment/.env.production.example`

**Step 1: Add variables to bootstrap.conf.example**

Add after the SWAP_SIZE section:

```bash
# ============================================================================
# BACKUP SETTINGS
# ============================================================================

# Backup encryption password (required - auto-generated if empty)
# CRITICAL: Store this password securely - without it, backups cannot be restored
RESTIC_PASSWORD=""

# Local backup repository path
RESTIC_REPOSITORY="/opt/timetiles/backups/restic-repo"

# Offsite S3-compatible storage (optional)
# Examples:
#   AWS S3: "s3:s3.amazonaws.com/bucket-name/timetiles"
#   Backblaze B2: "s3:s3.us-west-000.backblazeb2.com/bucket-name/timetiles"
#   Wasabi: "s3:s3.wasabisys.com/bucket-name/timetiles"
#   MinIO: "s3:minio.example.com/bucket-name/timetiles"
# RESTIC_OFFSITE_REPOSITORY=""

# S3 credentials (required if using offsite)
# AWS_ACCESS_KEY_ID=""
# AWS_SECRET_ACCESS_KEY=""

# For non-AWS S3-compatible storage, set endpoint URL:
# AWS_ENDPOINT_URL=""

# Retention policy (how many snapshots to keep)
# BACKUP_KEEP_DAILY="7"
# BACKUP_KEEP_WEEKLY="4"
# BACKUP_KEEP_MONTHLY="12"
```

**Step 2: Add variables to .env.production.example**

Add to `deployment/.env.production.example` after other config sections:

```bash
# =============================================================================
# Backup Configuration
# =============================================================================

# Backup encryption password (KEEP THIS SECURE)
RESTIC_PASSWORD=

# Local backup repository
RESTIC_REPOSITORY=/opt/timetiles/backups/restic-repo

# Offsite S3-compatible storage (optional)
# RESTIC_OFFSITE_REPOSITORY=s3:s3.amazonaws.com/your-bucket/timetiles
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# AWS_ENDPOINT_URL=

# Retention policy
BACKUP_KEEP_DAILY=7
BACKUP_KEEP_WEEKLY=4
BACKUP_KEEP_MONTHLY=12
```

**Step 3: Commit**

```bash
git add deployment/bootstrap/bootstrap.conf.example deployment/.env.production.example
git commit -m "feat(deploy): add restic backup configuration variables"
```

---

## Task 3: Generate RESTIC_PASSWORD in Bootstrap

**Files:**
- Modify: `deployment/bootstrap/steps/06-configure.sh`

**Step 1: Add RESTIC_PASSWORD generation**

After the PAYLOAD_SECRET generation block (around line 30), add:

```bash
    if [[ -z "${RESTIC_PASSWORD:-}" ]]; then
        RESTIC_PASSWORD=$(generate_secret 32)
        print_info "Generated restic backup password"
        save_config_to_state "RESTIC_PASSWORD" "$RESTIC_PASSWORD"
    fi
```

**Step 2: Add RESTIC_PASSWORD to sed substitutions**

After the other sed commands (around line 43), add:

```bash
    # Backup configuration
    sed -i "s|RESTIC_PASSWORD=.*|RESTIC_PASSWORD=$RESTIC_PASSWORD|" "$env_file"
```

**Step 3: Add RESTIC_PASSWORD to credentials file**

In the `create_credentials_file` function, add after the Let's Encrypt section:

```bash
Backup Encryption:
  Password: $RESTIC_PASSWORD
  CRITICAL: Without this password, backups cannot be restored!
```

**Step 4: Commit**

```bash
git add deployment/bootstrap/steps/06-configure.sh
git commit -m "feat(deploy): generate RESTIC_PASSWORD in bootstrap"
```

---

## Task 4: Replace Backup Command with Restic

**Files:**
- Modify: `deployment/timetiles` (backup section, lines 221-441)

**Step 1: Add restic helper functions**

Add these functions near the top of the file, after the color definitions (around line 20):

```bash
# Restic configuration
load_restic_config() {
    RESTIC_PASSWORD="${RESTIC_PASSWORD:-}"
    RESTIC_REPOSITORY="${RESTIC_REPOSITORY:-$SCRIPT_DIR/backups/restic-repo}"
    RESTIC_OFFSITE_REPOSITORY="${RESTIC_OFFSITE_REPOSITORY:-}"
    AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID:-}"
    AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY:-}"
    AWS_ENDPOINT_URL="${AWS_ENDPOINT_URL:-}"
    BACKUP_KEEP_DAILY="${BACKUP_KEEP_DAILY:-7}"
    BACKUP_KEEP_WEEKLY="${BACKUP_KEEP_WEEKLY:-4}"
    BACKUP_KEEP_MONTHLY="${BACKUP_KEEP_MONTHLY:-12}"

    if [[ -z "$RESTIC_PASSWORD" ]]; then
        echo -e "${RED}Error: RESTIC_PASSWORD not set in .env.production${NC}"
        echo "Run bootstrap or manually set RESTIC_PASSWORD"
        exit 1
    fi

    export RESTIC_PASSWORD
    export AWS_ACCESS_KEY_ID
    export AWS_SECRET_ACCESS_KEY
}

# Initialize restic repo if needed
init_restic_repo() {
    local repo="$1"
    local name="$2"

    if [[ "$repo" == s3:* ]]; then
        export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
        [[ -n "$AWS_ENDPOINT_URL" ]] && export AWS_ENDPOINT_URL
    fi

    # Check if repo exists
    if ! restic -r "$repo" snapshots &>/dev/null; then
        echo -e "${YELLOW}Initializing $name restic repository...${NC}"
        if ! restic -r "$repo" init 2>&1; then
            # Might already be initialized (race condition or permissions)
            if ! restic -r "$repo" snapshots &>/dev/null; then
                echo -e "${RED}Failed to initialize $name repository${NC}"
                return 1
            fi
        fi
    fi
    return 0
}

# Run restic with proper environment
run_restic() {
    local repo="$1"
    shift

    if [[ "$repo" == s3:* ]]; then
        export AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY
        [[ -n "$AWS_ENDPOINT_URL" ]] && export AWS_ENDPOINT_URL
    fi

    restic -r "$repo" "$@"
}
```

**Step 2: Replace the backup command case block**

Replace the entire `backup)` case (lines 221-441) with:

```bash
    backup)
        check_env
        load_restic_config

        OFFSITE=false
        WHAT="full"

        # Parse arguments
        while [[ $# -gt 1 ]]; do
            case "$2" in
                --offsite) OFFSITE=true; shift ;;
                db|database) WHAT="db"; shift ;;
                uploads) WHAT="uploads"; shift ;;
                list|prune|verify|auto) WHAT="$2"; shift; break ;;
                *) shift ;;
            esac
        done

        case "$WHAT" in
            db|database)
                # Initialize local repo
                if ! init_restic_repo "$RESTIC_REPOSITORY" "local"; then
                    exit 1
                fi

                echo -e "${YELLOW}Backing up database...${NC}"

                # Create temp SQL dump
                TEMP_DUMP=$(mktemp)
                trap "rm -f $TEMP_DUMP" EXIT

                if ! $DC_CMD exec -T postgres bash -c 'PGPASSWORD=$POSTGRES_PASS pg_dump -h localhost -U $POSTGRES_USER --clean --if-exists $POSTGRES_DBNAME' > "$TEMP_DUMP"; then
                    echo -e "${RED}Database dump failed${NC}"
                    send_alert "Backup Failed" "Database dump failed at $(date)"
                    exit 1
                fi

                # Backup to local restic repo
                if ! run_restic "$RESTIC_REPOSITORY" backup --tag db --stdin --stdin-filename "database.sql" < "$TEMP_DUMP"; then
                    echo -e "${RED}Restic backup failed${NC}"
                    send_alert "Backup Failed" "Restic backup failed at $(date)"
                    exit 1
                fi

                echo -e "${GREEN}Database backup complete${NC}"

                # Offsite sync
                if $OFFSITE && [[ -n "$RESTIC_OFFSITE_REPOSITORY" ]]; then
                    echo -e "${YELLOW}Syncing to offsite...${NC}"
                    if init_restic_repo "$RESTIC_OFFSITE_REPOSITORY" "offsite" 2>/dev/null; then
                        if run_restic "$RESTIC_OFFSITE_REPOSITORY" backup --tag db --stdin --stdin-filename "database.sql" < "$TEMP_DUMP" 2>/dev/null; then
                            echo -e "${GREEN}Offsite sync complete${NC}"
                        else
                            echo -e "${YELLOW}Offsite sync failed (continuing - local backup succeeded)${NC}"
                        fi
                    else
                        echo -e "${YELLOW}Offsite init failed (write-only credentials?) - skipping${NC}"
                    fi
                fi
                ;;

            uploads)
                if ! init_restic_repo "$RESTIC_REPOSITORY" "local"; then
                    exit 1
                fi

                echo -e "${YELLOW}Backing up uploads...${NC}"

                UPLOAD_VOL=$(docker volume ls -q | grep -E 'timetiles.*uploads' | head -1)
                if [[ -z "$UPLOAD_VOL" ]]; then
                    echo -e "${RED}Upload volume not found${NC}"
                    exit 1
                fi

                # Backup uploads via docker
                if ! docker run --rm \
                    -v "$UPLOAD_VOL:/data:ro" \
                    -e RESTIC_PASSWORD="$RESTIC_PASSWORD" \
                    -v "$RESTIC_REPOSITORY:/repo" \
                    restic/restic -r /repo backup --tag uploads /data; then
                    echo -e "${RED}Uploads backup failed${NC}"
                    send_alert "Backup Failed" "Uploads backup failed at $(date)"
                    exit 1
                fi

                echo -e "${GREEN}Uploads backup complete${NC}"

                # Offsite sync for uploads
                if $OFFSITE && [[ -n "$RESTIC_OFFSITE_REPOSITORY" ]]; then
                    echo -e "${YELLOW}Syncing uploads to offsite...${NC}"
                    # For S3 offsite, run restic directly with volume mount
                    if docker run --rm \
                        -v "$UPLOAD_VOL:/data:ro" \
                        -e RESTIC_PASSWORD="$RESTIC_PASSWORD" \
                        -e AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
                        -e AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
                        ${AWS_ENDPOINT_URL:+-e AWS_ENDPOINT_URL="$AWS_ENDPOINT_URL"} \
                        restic/restic -r "$RESTIC_OFFSITE_REPOSITORY" backup --tag uploads /data 2>/dev/null; then
                        echo -e "${GREEN}Offsite uploads sync complete${NC}"
                    else
                        echo -e "${YELLOW}Offsite uploads sync failed (continuing)${NC}"
                    fi
                fi
                ;;

            full)
                echo -e "${YELLOW}Creating full backup (database + uploads)...${NC}"

                # Run both backups
                BACKUP_ARGS=""
                $OFFSITE && BACKUP_ARGS="--offsite"

                "$0" backup db $BACKUP_ARGS || exit 1
                "$0" backup uploads $BACKUP_ARGS || exit 1

                echo -e "${GREEN}Full backup complete${NC}"
                ;;

            list)
                REPO="$RESTIC_REPOSITORY"
                if [[ "$2" == "--offsite" ]]; then
                    if [[ -z "$RESTIC_OFFSITE_REPOSITORY" ]]; then
                        echo -e "${RED}No offsite repository configured${NC}"
                        exit 1
                    fi
                    REPO="$RESTIC_OFFSITE_REPOSITORY"
                    echo -e "${YELLOW}Listing offsite snapshots...${NC}"
                    echo -e "${YELLOW}(Requires read permissions - may fail with write-only credentials)${NC}"
                fi

                if ! run_restic "$REPO" snapshots 2>/dev/null; then
                    if [[ "$REPO" == "$RESTIC_OFFSITE_REPOSITORY" ]]; then
                        echo -e "${YELLOW}Cannot list offsite snapshots (read permissions required)${NC}"
                        echo "Use AWS console or a machine with read access to view offsite backups"
                    else
                        echo -e "${RED}Failed to list snapshots${NC}"
                        exit 1
                    fi
                fi
                ;;

            prune)
                echo -e "${YELLOW}Applying retention policy...${NC}"
                echo "Keeping: $BACKUP_KEEP_DAILY daily, $BACKUP_KEEP_WEEKLY weekly, $BACKUP_KEEP_MONTHLY monthly"

                # Prune local
                if run_restic "$RESTIC_REPOSITORY" forget \
                    --keep-daily "$BACKUP_KEEP_DAILY" \
                    --keep-weekly "$BACKUP_KEEP_WEEKLY" \
                    --keep-monthly "$BACKUP_KEEP_MONTHLY" \
                    --prune; then
                    echo -e "${GREEN}Local repository pruned${NC}"
                else
                    echo -e "${RED}Local prune failed${NC}"
                    exit 1
                fi

                # Prune offsite (may fail with write-only)
                if [[ -n "$RESTIC_OFFSITE_REPOSITORY" ]]; then
                    echo -e "${YELLOW}Pruning offsite repository...${NC}"
                    if run_restic "$RESTIC_OFFSITE_REPOSITORY" forget \
                        --keep-daily "$BACKUP_KEEP_DAILY" \
                        --keep-weekly "$BACKUP_KEEP_WEEKLY" \
                        --keep-monthly "$BACKUP_KEEP_MONTHLY" \
                        --prune 2>/dev/null; then
                        echo -e "${GREEN}Offsite repository pruned${NC}"
                    else
                        echo -e "${YELLOW}Offsite prune skipped (delete permissions required)${NC}"
                        echo "Use S3 lifecycle rules to expire old offsite backups"
                    fi
                fi
                ;;

            verify)
                echo -e "${YELLOW}Verifying backup repository...${NC}"

                if run_restic "$RESTIC_REPOSITORY" check; then
                    echo -e "${GREEN}Local repository verified${NC}"
                else
                    echo -e "${RED}Local repository has errors${NC}"
                    send_alert "Backup Verify Failed" "Local backup repository verification failed"
                    exit 1
                fi

                # Show recent snapshots
                echo ""
                echo "Recent snapshots:"
                run_restic "$RESTIC_REPOSITORY" snapshots --last 5
                ;;

            auto)
                CRON_OFFSITE=""
                DISABLE=false

                for arg in "${@:2}"; do
                    case "$arg" in
                        --offsite) CRON_OFFSITE="--offsite" ;;
                        --disable) DISABLE=true ;;
                    esac
                done

                CRON_SCRIPT="$SCRIPT_DIR/backups/auto-backup.sh"
                mkdir -p "$SCRIPT_DIR/backups"

                if $DISABLE; then
                    echo -e "${YELLOW}Disabling automatic backups...${NC}"
                    crontab -l 2>/dev/null | grep -v "$CRON_SCRIPT" | crontab -
                    rm -f "$CRON_SCRIPT"
                    echo -e "${GREEN}Automatic backups disabled${NC}"
                else
                    echo -e "${YELLOW}Setting up automatic daily backups...${NC}"

                    cat > "$CRON_SCRIPT" << EOF
#!/bin/bash
cd "$SCRIPT_DIR"
./timetiles backup $CRON_OFFSITE
./timetiles backup prune
EOF
                    chmod +x "$CRON_SCRIPT"

                    # Add to crontab (daily at 2 AM)
                    CRON_CMD="0 2 * * * $CRON_SCRIPT >> /var/log/timetiles-backup.log 2>&1"
                    (crontab -l 2>/dev/null | grep -v "$CRON_SCRIPT"; echo "$CRON_CMD") | crontab -

                    echo -e "${GREEN}Automatic backups configured (daily at 2 AM)${NC}"
                    [[ -n "$CRON_OFFSITE" ]] && echo "Offsite sync enabled"
                    echo "Logs: /var/log/timetiles-backup.log"
                    echo "To disable: timetiles backup auto --disable"
                fi
                ;;

            *)
                echo "Usage: $0 backup [--offsite] [db|uploads|full]"
                echo "       $0 backup list [--offsite]"
                echo "       $0 backup prune"
                echo "       $0 backup verify"
                echo "       $0 backup auto [--offsite] [--disable]"
                echo ""
                echo "Commands:"
                echo "  full      - Backup database and uploads (default)"
                echo "  db        - Backup database only"
                echo "  uploads   - Backup uploads only"
                echo "  list      - List snapshots"
                echo "  prune     - Apply retention policy"
                echo "  verify    - Check repository integrity"
                echo "  auto      - Setup automatic daily backups"
                echo ""
                echo "Options:"
                echo "  --offsite - Also sync to S3 (for backup/auto)"
                echo "            - List from S3 (for list)"
                exit 1
                ;;
        esac
        ;;
```

**Step 3: Test manually**

```bash
# In deployment directory with .env.production configured
./timetiles backup db
./timetiles backup list
./timetiles backup verify
```

**Step 4: Commit**

```bash
git add deployment/timetiles
git commit -m "feat(deploy): replace backup system with restic"
```

---

## Task 5: Replace Restore Command with Restic

**Files:**
- Modify: `deployment/timetiles` (restore section)

**Step 1: Replace the restore command**

Replace the entire `restore)` case with:

```bash
    restore)
        check_env
        load_restic_config

        SNAPSHOT="${2:-}"
        OFFSITE=false

        # Check for --offsite flag
        for arg in "$@"; do
            [[ "$arg" == "--offsite" ]] && OFFSITE=true
        done

        REPO="$RESTIC_REPOSITORY"
        if $OFFSITE; then
            if [[ -z "$RESTIC_OFFSITE_REPOSITORY" ]]; then
                echo -e "${RED}No offsite repository configured${NC}"
                exit 1
            fi
            REPO="$RESTIC_OFFSITE_REPOSITORY"
            echo -e "${YELLOW}Restoring from offsite repository...${NC}"
            echo -e "${YELLOW}(Requires read permissions)${NC}"
        fi

        # If no snapshot specified, list and prompt
        if [[ -z "$SNAPSHOT" ]] || [[ "$SNAPSHOT" == "--offsite" ]]; then
            echo -e "${YELLOW}Available snapshots:${NC}"
            if ! run_restic "$REPO" snapshots 2>/dev/null; then
                if $OFFSITE; then
                    echo -e "${RED}Cannot list offsite snapshots (read permissions required)${NC}"
                    echo "Use AWS console to find snapshot ID, then run:"
                    echo "  timetiles restore <snapshot-id> --offsite"
                fi
                exit 1
            fi
            echo ""
            echo "Usage: timetiles restore <snapshot-id> [--offsite]"
            echo "       timetiles restore latest [--offsite]"
            exit 0
        fi

        # Handle 'latest' keyword
        if [[ "$SNAPSHOT" == "latest" ]]; then
            SNAPSHOT=$(run_restic "$REPO" snapshots --json --latest 1 2>/dev/null | jq -r '.[0].short_id // empty')
            if [[ -z "$SNAPSHOT" ]]; then
                echo -e "${RED}No snapshots found${NC}"
                exit 1
            fi
            echo "Latest snapshot: $SNAPSHOT"
        fi

        # Get snapshot info
        SNAPSHOT_INFO=$(run_restic "$REPO" snapshots --json "$SNAPSHOT" 2>/dev/null)
        if [[ -z "$SNAPSHOT_INFO" ]] || [[ "$SNAPSHOT_INFO" == "[]" ]]; then
            echo -e "${RED}Snapshot not found: $SNAPSHOT${NC}"
            exit 1
        fi

        TAGS=$(echo "$SNAPSHOT_INFO" | jq -r '.[0].tags // [] | join(",")')
        echo "Snapshot $SNAPSHOT tags: $TAGS"

        # Confirm restore
        echo ""
        echo -e "${YELLOW}WARNING: This will overwrite current data!${NC}"
        read -p "Continue with restore? [y/N] " -n 1 -r
        echo
        [[ ! $REPLY =~ ^[Yy]$ ]] && exit 0

        RESTORE_DIR=$(mktemp -d)
        trap "rm -rf $RESTORE_DIR" EXIT

        # Restore snapshot to temp directory
        echo -e "${YELLOW}Extracting snapshot...${NC}"
        if ! run_restic "$REPO" restore "$SNAPSHOT" --target "$RESTORE_DIR"; then
            echo -e "${RED}Failed to extract snapshot${NC}"
            exit 1
        fi

        # Check what was restored
        if [[ -f "$RESTORE_DIR/database.sql" ]]; then
            echo -e "${YELLOW}Restoring database...${NC}"

            # Restore database
            if ! $DC_CMD exec -T postgres bash -c 'PGPASSWORD=$POSTGRES_PASS psql -h localhost -U $POSTGRES_USER $POSTGRES_DBNAME' < "$RESTORE_DIR/database.sql"; then
                echo -e "${RED}Database restore failed${NC}"
                send_alert "Restore Failed" "Database restore failed at $(date)"
                exit 1
            fi
            echo -e "${GREEN}Database restored${NC}"
        fi

        if [[ -d "$RESTORE_DIR/data" ]]; then
            echo -e "${YELLOW}Restoring uploads...${NC}"

            UPLOAD_VOL=$(docker volume ls -q | grep -E 'timetiles.*uploads' | head -1)
            if [[ -z "$UPLOAD_VOL" ]]; then
                echo -e "${RED}Upload volume not found${NC}"
                exit 1
            fi

            # Restore uploads via docker
            if ! docker run --rm \
                -v "$UPLOAD_VOL:/data" \
                -v "$RESTORE_DIR/data:/restore:ro" \
                alpine sh -c "rm -rf /data/* && cp -a /restore/. /data/"; then
                echo -e "${RED}Uploads restore failed${NC}"
                send_alert "Restore Failed" "Uploads restore failed at $(date)"
                exit 1
            fi
            echo -e "${GREEN}Uploads restored${NC}"
        fi

        echo -e "${GREEN}Restore complete!${NC}"
        ;;
```

**Step 2: Test manually**

```bash
./timetiles restore              # Should list snapshots
./timetiles restore latest       # Restore latest
```

**Step 3: Commit**

```bash
git add deployment/timetiles
git commit -m "feat(deploy): replace restore command with restic"
```

---

## Task 6: Update Test Script for Restic

**Files:**
- Modify: `deployment/bootstrap/test-multipass.sh`

**Step 1: Update test_backup_restore function**

Replace the `test_backup_restore` function with:

```bash
test_backup_restore() {
    print_header "Testing Backup/Restore"

    local deploy_cmd="cd /opt/timetiles && sudo ./timetiles"

    # Test database backup
    print_step "Creating database backup..."
    if multipass exec "$VM_NAME" -- bash -c "${deploy_cmd} backup db"; then
        print_success "Database backup created"
    else
        print_error "Database backup failed"
        return 1
    fi

    # Test uploads backup
    print_step "Creating uploads backup..."
    if multipass exec "$VM_NAME" -- bash -c "${deploy_cmd} backup uploads"; then
        print_success "Uploads backup created"
    else
        print_error "Uploads backup failed"
        return 1
    fi

    # List snapshots
    print_step "Listing snapshots..."
    multipass exec "$VM_NAME" -- bash -c "${deploy_cmd} backup list"

    # Verify repository
    print_step "Verifying backup repository..."
    if multipass exec "$VM_NAME" -- bash -c "${deploy_cmd} backup verify"; then
        print_success "Backup verification passed"
    else
        print_warning "Backup verification had issues"
    fi

    # Count snapshots (should have at least 2: db + uploads)
    print_step "Checking snapshot count..."
    local snapshot_count
    snapshot_count=$(multipass exec "$VM_NAME" -- bash -c "cd /opt/timetiles && RESTIC_PASSWORD=\$(grep RESTIC_PASSWORD .env.production | cut -d= -f2) restic -r /opt/timetiles/backups/restic-repo snapshots --json 2>/dev/null | jq length")
    if [[ "$snapshot_count" -ge 2 ]]; then
        print_success "Found $snapshot_count snapshots"
    else
        print_error "Expected at least 2 snapshots, found $snapshot_count"
        return 1
    fi

    print_success "Backup/Restore tests passed"
}
```

**Step 2: Commit**

```bash
git add deployment/bootstrap/test-multipass.sh
git commit -m "test(deploy): update multipass test for restic backups"
```

---

## Task 7: Update GitHub Workflow Test

**Files:**
- Modify: `.github/workflows/test-deployment.yml`

**Step 1: Update backup test assertions**

Find the backup/restore test section and update to test restic:

```yaml
      - name: Test backup
        run: |
          cd deployment
          ./timetiles backup db
          ./timetiles backup uploads
          ./timetiles backup list
          ./timetiles backup verify

      - name: Verify backup snapshots
        run: |
          cd deployment
          source .env.production
          SNAPSHOT_COUNT=$(restic -r "$RESTIC_REPOSITORY" snapshots --json | jq length)
          echo "Snapshot count: $SNAPSHOT_COUNT"
          [ "$SNAPSHOT_COUNT" -ge 2 ] || exit 1
```

**Step 2: Update restore test**

```yaml
      - name: Test restore
        run: |
          cd deployment
          # Get latest snapshot ID
          source .env.production
          SNAPSHOT=$(restic -r "$RESTIC_REPOSITORY" snapshots --json --latest 1 | jq -r '.[0].short_id')
          echo "Restoring snapshot: $SNAPSHOT"
          echo "y" | ./timetiles restore "$SNAPSHOT"
```

**Step 3: Commit**

```bash
git add .github/workflows/test-deployment.yml
git commit -m "test(deploy): update CI workflow for restic backups"
```

---

## Task 8: Update Documentation

**Files:**
- Modify: `apps/docs/content/admin-guide/maintenance.mdx`
- Modify: `deployment/README.md`

**Step 1: Update maintenance.mdx backup section**

Replace the backup procedures section with:

```markdown
### Backup Procedures

TimeTiles uses [restic](https://restic.net/) for encrypted, deduplicated backups with optional offsite storage.

#### Quick Commands

```bash
# Full backup (database + uploads)
timetiles backup

# Full backup with offsite sync
timetiles backup --offsite

# Database only
timetiles backup db

# Uploads only
timetiles backup uploads

# List snapshots
timetiles backup list

# Verify backup integrity
timetiles backup verify

# Apply retention policy
timetiles backup prune

# Setup automatic daily backups
timetiles backup auto

# Setup daily backups with offsite sync
timetiles backup auto --offsite
```

#### Restore from Backup

```bash
# List available snapshots
timetiles restore

# Restore latest snapshot
timetiles restore latest

# Restore specific snapshot
timetiles restore abc123

# Restore from offsite (if local unavailable)
timetiles restore abc123 --offsite
```

#### Offsite Backups (S3)

Configure S3-compatible offsite storage in `.env.production`:

```bash
RESTIC_OFFSITE_REPOSITORY=s3:s3.amazonaws.com/your-bucket/timetiles
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
```

For write-only credentials (recommended for security), use S3 lifecycle rules to expire old backups instead of `timetiles backup prune`.

The backup system automatically:
- Encrypts all backups with RESTIC_PASSWORD
- Deduplicates data to save space
- Applies retention policy: 7 daily, 4 weekly, 12 monthly
```

**Step 2: Update deployment/README.md**

Add backup section:

```markdown
## Backup System

Uses restic for encrypted, deduplicated backups.

```bash
./timetiles backup              # Full backup (db + uploads)
./timetiles backup --offsite    # Include S3 offsite sync
./timetiles backup list         # Show snapshots
./timetiles backup prune        # Apply retention policy
./timetiles restore latest      # Restore most recent
```

Configuration in `.env.production`:
- `RESTIC_PASSWORD` - Encryption key (auto-generated)
- `RESTIC_REPOSITORY` - Local repo path
- `RESTIC_OFFSITE_REPOSITORY` - S3 URL (optional)
```

**Step 3: Commit**

```bash
git add apps/docs/content/admin-guide/maintenance.mdx deployment/README.md
git commit -m "docs: update backup documentation for restic"
```

---

## Task 9: Final Integration Test

**Step 1: Run full test suite**

```bash
# Local test with multipass
cd deployment/bootstrap
./test-multipass.sh --local

# Or run CI workflow locally if act is installed
act -j test-deployment
```

**Step 2: Verify all commands work**

```bash
timetiles backup db
timetiles backup uploads
timetiles backup list
timetiles backup verify
timetiles backup prune
timetiles restore  # Should list snapshots
```

**Step 3: Final commit and push**

```bash
git status  # Verify clean
git push origin main
```

---

## Summary

| Task | Description |
|------|-------------|
| 1 | Add restic to bootstrap packages |
| 2 | Add config variables |
| 3 | Generate RESTIC_PASSWORD |
| 4 | Replace backup command |
| 5 | Replace restore command |
| 6 | Update multipass test |
| 7 | Update CI workflow |
| 8 | Update documentation |
| 9 | Final integration test |

Total: 9 tasks, ~45-60 minutes estimated implementation time.
