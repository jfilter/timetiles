# Restic Backup System Design

## Overview

Replace the current pg_dump/tar backup system with restic for encrypted, deduplicated backups with local and offsite (S3-compatible) storage support.

## Goals

- **Offsite backups** - Store backups in S3-compatible storage for disaster recovery
- **Space efficiency** - Deduplication reduces storage requirements
- **Encryption** - All backups encrypted at rest
- **Write-only offsite** - Support append-only S3 credentials for security

## Architecture

```
pg_dump → temp SQL file → restic backup → local repo (/opt/timetiles/backups/restic-repo)
                                       ↘ S3 offsite (if configured)

uploads volume → restic backup → local repo
                              ↘ S3 offsite (if configured)
```

**Key decisions:**
- `pg_dump` creates consistent database snapshots (restic backs up the dump, not raw postgres data)
- Uploads backed up directly from Docker volume
- Two independent restic repos: local (primary) + S3 (offsite)
- Single `RESTIC_PASSWORD` encrypts both repos
- Offsite sync after successful local backup

## Configuration

```bash
# Backup encryption (required - auto-generated if empty)
RESTIC_PASSWORD=""

# Local backup repository
RESTIC_REPOSITORY="/opt/timetiles/backups/restic-repo"

# Offsite S3-compatible storage (optional)
RESTIC_OFFSITE_REPOSITORY=""  # e.g., "s3:s3.amazonaws.com/bucket/timetiles"
AWS_ACCESS_KEY_ID=""
AWS_SECRET_ACCESS_KEY=""
# For non-AWS S3-compatible (B2, Wasabi, MinIO):
# AWS_ENDPOINT_URL="https://s3.us-west-000.backblazeb2.com"

# Retention policy
BACKUP_KEEP_DAILY="7"
BACKUP_KEEP_WEEKLY="4"
BACKUP_KEEP_MONTHLY="12"
```

## CLI Commands

### Backup

```bash
timetiles backup              # Full backup (db + uploads) to local
timetiles backup --offsite    # Full backup + sync to S3
timetiles backup db           # Database only
timetiles backup uploads      # Uploads only
```

### Management

```bash
timetiles backup list                    # List local snapshots
timetiles backup list --offsite          # List S3 snapshots
timetiles backup prune                   # Apply retention policy
timetiles backup verify                  # Check repo integrity
```

### Restore

```bash
timetiles restore                        # Interactive: list snapshots, pick one
timetiles restore latest                 # Restore most recent
timetiles restore <snapshot-id>          # Restore specific snapshot
timetiles restore <id> --offsite         # Restore from S3
```

### Auto Backup

```bash
timetiles backup auto                    # Setup daily cron at 2 AM
timetiles backup auto --offsite          # Daily local + offsite sync
timetiles backup auto --disable          # Remove cron job
```

## Write-Only Offsite Support

For security, offsite S3 can use write-only credentials. The tool gracefully handles permission limitations:

| Command | Write-only behavior |
|---------|---------------------|
| `backup --offsite` | Works (write-only needed) |
| `backup list --offsite` | Skips with message |
| `backup prune` | Prunes local only, skips offsite |
| `restore --offsite` | Fails with helpful message |

**Recommendation:** Use S3 lifecycle rules to expire objects after 90 days instead of restic prune for offsite.

## Error Handling

**Backup failures:**
- pg_dump fails → abort, send alert, exit 1
- restic backup fails → abort, send alert, exit 1
- offsite sync fails → warn but don't fail (local succeeded)

**Restore failures:**
- snapshot not found → list available, exit 1
- restic restore fails → abort, send alert, exit 1

**Repo initialization:**
- Auto-run `restic init` on first backup if repo doesn't exist
- Idempotent for offsite (ignore "already initialized")

**Alerting:**
- Uses existing `send_alert` function
- Alerts on: backup failure, restore failure, verify failure
- No alert on: offsite permission errors (expected with write-only)

## Bootstrap Changes

- Add `restic` to apt packages in step 01
- Generate `RESTIC_PASSWORD` in step 06 (with other secrets)
- Update `bootstrap.conf.example` with new variables

## Dependencies

- `restic` package (available in Ubuntu 24.04 repos)
- Existing: Docker, pg_dump (via postgres container)
