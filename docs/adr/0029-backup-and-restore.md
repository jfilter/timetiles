# ADR 0029: Backup and Restore Strategy

## Status

Accepted

## Context

TimeTiles stores two categories of persistent data: a PostgreSQL database (event records, user accounts, import history, configuration) and uploaded files (media, import source files, data exports). The deployment architecture (ADR 0006) uses local filesystem storage and a single PostgreSQL instance -- there is no managed database service or object storage to delegate backup responsibilities to.

The previous backup approach used raw `pg_dump` and `tar` archives stored in a single local directory. This had no encryption, no deduplication, no offsite copy, and no retention policy. A disk failure or compromised server would lose both the application data and all backups.

## Decision

### Restic as the Backup Storage Layer

Backups use a two-layer approach: `pg_dump` creates consistent database snapshots as SQL files, and restic manages the storage, encryption, deduplication, and retention of those snapshots alongside the uploads directory.

Restic was chosen over alternatives (Borg, raw S3 sync, custom scripts) because it supports S3-compatible backends natively, provides client-side encryption with a single password, deduplicates at the block level, and is available as a single static binary in the Ubuntu 24.04 repositories.

### What Gets Backed Up

| Data     | Source                    | Method                                       |
| -------- | ------------------------- | -------------------------------------------- |
| Database | PostgreSQL container      | `pg_dump` to temporary SQL file, then restic |
| Uploads  | Docker volume / host path | Restic backs up the directory directly       |

Restic does not back up raw PostgreSQL data files. It backs up the `pg_dump` output, which produces a portable, consistent snapshot regardless of whether PostgreSQL is running. This avoids the complexity of filesystem-level snapshots or WAL archiving.

### Dual-Repository Architecture

Backups are stored in two independent restic repositories:

1. **Local repository** (`/opt/timetiles/backups/restic-repo`) -- always configured, serves as the primary backup target for fast restores.
2. **Offsite repository** (S3-compatible storage) -- optional, receives a copy after each successful local backup.

Both repositories use the same `RESTIC_PASSWORD` for encryption. The offsite repository supports any S3-compatible backend: AWS S3, Backblaze B2, Wasabi, MinIO.

Offsite sync is best-effort: if it fails, the local backup has already succeeded and the operation reports a warning rather than a failure. This prevents transient network issues from marking an otherwise successful backup as failed.

### Write-Only S3 Credentials

The offsite repository supports S3 credentials that only have write (PutObject) and list (ListBucket) permissions, without delete permissions. This protects against ransomware or a compromised server deleting offsite backups.

With write-only credentials, the following behaviors apply:

| Operation           | Behavior                                                         |
| ------------------- | ---------------------------------------------------------------- |
| `backup --offsite`  | Works (only needs write)                                         |
| `list --offsite`    | Skips with informational message                                 |
| `prune`             | Prunes local repository only, skips offsite                      |
| `restore --offsite` | Fails with message directing user to use full-access credentials |

For offsite retention, the recommendation is to use S3 lifecycle rules (e.g., expire objects after 90 days) rather than restic prune, since prune requires delete permissions.

### Retention Policy

Default retention applied during `backup prune`:

| Period  | Kept | Rationale                           |
| ------- | ---- | ----------------------------------- |
| Daily   | 7    | One week of daily recovery points   |
| Weekly  | 4    | One month of weekly recovery points |
| Monthly | 12   | One year of monthly recovery points |

These defaults are configurable via environment variables (`BACKUP_KEEP_DAILY`, `BACKUP_KEEP_WEEKLY`, `BACKUP_KEEP_MONTHLY`). Pruning is not automatic -- it runs only when the operator invokes `timetiles backup prune`.

### CLI Interface

All backup operations are exposed through the `timetiles` CLI:

```bash
# Backup
timetiles backup                  # Database + uploads to local repo
timetiles backup --offsite        # Local + sync to S3
timetiles backup db               # Database only
timetiles backup uploads          # Uploads only

# Management
timetiles backup list             # List local snapshots
timetiles backup prune            # Apply retention policy
timetiles backup verify           # Check repository integrity

# Restore
timetiles restore latest          # Restore most recent snapshot
timetiles restore <snapshot-id>   # Restore specific snapshot

# Automation
timetiles backup auto             # Install daily cron job (2 AM)
timetiles backup auto --offsite   # Daily local + offsite
timetiles backup auto --disable   # Remove cron job
```

Repository initialization (`restic init`) runs automatically on first backup if the repository does not exist. This is idempotent for offsite repositories.

### CI-Tested Backup and Restore

The backup and restore scripts are tested in CI to prevent silent regressions. The test creates a database with seed data, runs a full backup, destroys the data, restores from the backup, and verifies the data matches. This ensures the backup-restore round trip works on every change to the deployment scripts.

### Encryption

All restic repositories are encrypted with `RESTIC_PASSWORD`. If the password is not set during bootstrap, it is auto-generated and written to the environment file alongside other secrets (in the same bootstrap step that generates `PAYLOAD_SECRET` and `DB_PASSWORD`). The password must be stored separately from the backup repository -- losing both the server and the password means the offsite backups are unrecoverable.

## Consequences

- **Restic is a runtime dependency**: The `restic` binary must be installed on the host (not inside a container). It is added to the bootstrap script's apt packages. This is a host-level dependency in an otherwise container-based deployment.
- **pg_dump over WAL archiving trades RPO for simplicity**: Point-in-time recovery is not possible. The recovery point objective is bounded by the backup frequency (daily by default). For TimeTiles's target use case (small to medium deployments), this is an acceptable trade-off. WAL archiving can be added later if needed.
- **Deduplication reduces storage cost significantly**: Restic's block-level deduplication means incremental backups of a mostly-unchanged database and upload directory consume minimal additional space. A week of daily backups may use only 1.1-1.5x the space of a single backup.
- **Write-only credentials limit offsite management**: Operators cannot list, prune, or restore from offsite using write-only credentials. They must use a separate set of full-access credentials for those operations, or rely on S3 lifecycle rules for retention. This is a deliberate security trade-off.
- **Single password for both repositories**: Simplifies configuration but means a compromised password exposes both local and offsite backups. Operators who want independent encryption can configure separate passwords manually.
- **Pruning is manual by default**: Automatic pruning was deliberately excluded from the default cron job to avoid unexpected data loss. Operators must run `timetiles backup prune` or add it to their own automation.
