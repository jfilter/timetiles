# ADR 0024: Data Export System

## Status

Accepted

## Context

TimeTiles stores user data across multiple collections: catalogs, datasets, events, import files, import jobs, scheduled imports, and media. Users need a way to export all of their data as a single downloadable archive. This is motivated by two concerns:

1. **GDPR data portability** (Article 20) -- users have the right to receive their personal data in a structured, commonly used, machine-readable format.
2. **User autonomy** -- users should be able to back up their data or migrate away from the platform at any time.

The export must handle arbitrarily large event sets (a single user may own millions of events across many datasets), avoid blocking the web server, and clean up after itself so disk usage does not grow unbounded.

## Decision

### Request Flow

A data export follows a four-step asynchronous pipeline:

1. **API request** -- The user calls `POST /api/data-exports/request`. The route handler verifies authentication, checks rate limits, confirms no export is already in progress, creates a `data-exports` record with status `pending`, and queues a `data-export` background job. Returns HTTP 202 with the export ID and a summary of record counts.
2. **Background job** -- The `data-export` job handler picks up the task, transitions the record to `processing`, collects all user data, writes a ZIP archive to disk, sets the record to `ready` with a 7-day expiry, and sends a notification email.
3. **Download** -- The user calls `GET /api/data-exports/:id/download`. The route verifies ownership (or admin role), checks the export is `ready` and not expired, atomically increments the download counter via raw SQL, and streams the ZIP file to the client.
4. **Cleanup** -- A scheduled `data-export-cleanup` job runs periodically, marks expired exports as `expired`, deletes the ZIP files from disk, and hard-deletes records older than 30 days that are in `failed` or `expired` status.

```
User                API Route              Job Queue           Disk
 |                     |                      |                 |
 |-- POST /request --> |                      |                 |
 |                     |-- create record ---> |                 |
 |                     |-- queue job -------> |                 |
 | <-- 202 Accepted -- |                      |                 |
 |                     |                      |-- fetch data -> |
 |                     |                      |-- write ZIP --> |
 |                     |                      |-- send email    |
 |                     |                      |                 |
 |-- GET /download --> |                      |                 |
 |                     |-- verify + stream ---|---------------> |
 | <-- ZIP stream ---- |                      |                 |
```

### Export Format: ZIP with JSON Files

Each export is a ZIP archive (zlib level 6 compression) containing:

| File                                                    | Contents                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------ |
| `manifest.json`                                         | Export metadata: timestamp, format version, user ID, record counts |
| `profile.json`                                          | Sanitized user profile (no password hash, no tokens)               |
| `catalogs.json`                                         | All user-owned catalogs                                            |
| `datasets.json`                                         | All user-owned datasets with schema config                         |
| `events/events-0001.json` ... `events/events-NNNN.json` | Events chunked at 10,000 per file                                  |
| `import-files.json`                                     | Import file metadata (not the original uploaded files)             |
| `import-jobs.json`                                      | Import job history                                                 |
| `scheduled-imports.json`                                | Scheduled import configurations                                    |
| `media/metadata.json`                                   | Media file metadata                                                |
| `media/files/...`                                       | Actual media files (when present on disk)                          |

**Why JSON, not CSV?** The data contains nested objects (event `data` field, schema configs) that do not map cleanly to tabular formats. JSON preserves structure and is machine-readable as required by GDPR.

**Why chunk events?** A user with 500,000 events would produce a single JSON file over 1 GB in memory. Chunking at 10,000 events per file caps memory usage during serialization and keeps individual files manageable for downstream tooling. Events are fetched using cursor-based pagination (`id > lastId`, sorted by `id`) to avoid offset-based performance degradation.

### Lifecycle: Five States

```
pending --> processing --> ready --> expired
    \           \
     \           \--> failed
      \--> failed (queue error)
```

| Status       | Meaning                                                 | Transition                                                                 |
| ------------ | ------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pending`    | Record created, job queued                              | Set by the request API route                                               |
| `processing` | Job is actively collecting data and writing the archive | Set by the job handler on start                                            |
| `ready`      | ZIP is on disk, download link active                    | Set by the job handler on success                                          |
| `failed`     | Something went wrong; `errorLog` has details            | Set by the job handler on error, or by the request route if queueing fails |
| `expired`    | Past the 7-day window; file deleted from disk           | Set by the cleanup job                                                     |

The request route uses a double-check pattern to prevent duplicate active exports: it queries for existing `pending`/`processing` records before creating, and catches race conditions on the `create` call by re-checking.

### Storage: Disk-Based

Export files are written to a configurable directory (`DATA_EXPORT_DIR` env var, defaults to `.exports/` relative to the working directory). The file path is stored in the `data-exports` record for cleanup.

**Why not object storage (S3)?** TimeTiles follows a single-process, minimal-infrastructure philosophy (see ADR 0001). Adding S3 would introduce a new external dependency and configuration surface for a feature that generates modest, ephemeral files. Disk storage is sufficient because:

- Exports are short-lived (7 days) and cleaned up automatically.
- A single user's export is typically tens of megabytes, rarely exceeding a few hundred.
- The deployment model (see ADR 0006) already provisions local disk for uploads and media.

If a deployment needs durable or replicated storage, the export directory can be pointed at a network-mounted volume via the environment variable.

### Cleanup Job

The `data-export-cleanup` job performs two passes:

1. **Expire ready exports** -- Finds records with status `ready` and `expiresAt < now`. Marks them `expired` (clearing `filePath`), then deletes the ZIP file from disk. The status update happens before the file delete so a concurrent download sees `expired` rather than a missing file.
2. **Purge old records** -- Deletes `failed` and `expired` records older than 30 days. This removes stale metadata from the database entirely.

Both passes process up to 100 records per run and log individual errors without aborting the batch.

### Rate Limiting and Quotas

The request endpoint uses the application's sliding-window rate limiter with the `DATA_EXPORT` configuration:

| Window   | Limit      |
| -------- | ---------- |
| 1 hour   | 1 request  |
| 24 hours | 3 requests |

Additionally, the route rejects requests when the user already has a `pending` or `processing` export. This prevents accidental duplicate work and limits concurrent resource consumption.

### Email Notifications

Two email templates handle completion and failure:

- **Export ready** -- Includes a download button with the full URL, file size in MB, expiry date, a list of what the export contains, and a warning about the expiry window. Uses green callout styling.
- **Export failed** -- Includes the error reason (when available), suggested next steps (retry or contact support), and a link to account settings. Uses red callout styling.

Both templates use the site's configured branding (logo, site name) and respect the user's locale for translations.

### Frontend Integration

The `useDataExport` hook family provides the client-side interface:

| Hook                           | Purpose                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `useDataExportsQuery`          | Fetches the user's recent exports; polls every 5 seconds while any export is `pending` or `processing` |
| `useLatestExportQuery`         | Returns the most relevant export (active first, then most recent)                                      |
| `useRequestDataExportMutation` | Triggers a new export and invalidates the query cache on success                                       |

The download endpoint returns the file with `Content-Disposition: attachment` and the filename `timetiles-data-export-{date}.zip`. The download route also handles edge cases: returning 202 if the export is still processing, 410 if expired, and 500 with the error log if failed.

### Collection Schema

The `data-exports` collection stores all metadata:

| Field           | Type         | Purpose                                                      |
| --------------- | ------------ | ------------------------------------------------------------ |
| `user`          | relationship | Owner of the export (indexed)                                |
| `status`        | select       | Current lifecycle state                                      |
| `requestedAt`   | date         | When the user made the request                               |
| `completedAt`   | date         | When processing finished (success or failure)                |
| `expiresAt`     | date         | When the download link expires (indexed for cleanup queries) |
| `filePath`      | text         | Absolute path to the ZIP on disk (hidden from admin UI)      |
| `fileSize`      | number       | Archive size in bytes                                        |
| `downloadCount` | number       | Atomically incremented on each download                      |
| `summary`       | json         | Record counts at time of export                              |
| `errorLog`      | textarea     | Error message on failure                                     |

Access control: users can read their own exports; only admins can create, update, or delete records directly. All programmatic writes use `overrideAccess: true`.

## Consequences

- Users can export all their data with a single click, satisfying GDPR Article 20 requirements.
- The asynchronous pipeline avoids blocking the web server during large exports.
- Cursor-based event pagination and chunked JSON files keep memory usage bounded regardless of dataset size.
- Disk-based storage avoids adding an object storage dependency, at the cost of exports not surviving disk loss during the 7-day window. This is acceptable because exports are reproducible -- the user can request a new one.
- The 7-day expiry and automated cleanup prevent unbounded disk growth.
- Rate limiting (1/hour, 3/day) prevents abuse while still allowing retries after failures.
- The double-check pattern on export creation handles race conditions without requiring database-level unique constraints on active exports.

**Reference:** `lib/export/service.ts`, `lib/export/types.ts`, `lib/export/emails.ts`, `lib/export/formatting.ts`, `lib/collections/data-exports.ts`, `lib/jobs/handlers/data-export-job.ts`, `lib/jobs/handlers/data-export-cleanup-job.ts`, `app/api/data-exports/request/route.ts`, `app/api/data-exports/[id]/download/route.ts`, `lib/hooks/use-data-export.ts`
