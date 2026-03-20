# ADR 0021: Background Jobs Architecture

## Status

Accepted

## Context

TimeTiles processes data imports, geocodes locations, manages scheduled fetches, runs web scrapers, and performs various housekeeping tasks. These operations can take seconds to minutes and must not block HTTP request handlers. The platform needs a reliable job queue that integrates with its existing PostgreSQL database and Payload CMS framework, without introducing external infrastructure like Redis or a dedicated message broker.

## Decision

### Job Queue: Payload CMS Built-In

All background work uses Payload CMS's built-in job queue, which stores jobs in PostgreSQL. Jobs are registered as task definitions in the Payload configuration and processed by calling `payload.jobs.run()` from a worker process (development: `make jobs`, production: external worker or Vercel Cron).

```typescript
// payload-config-factory.ts
jobs: {
  tasks: ALL_JOBS,          // 21 registered task definitions
  enableConcurrencyControl: true,
},
```

### Job Registration Pattern

Each job is a plain object with a `slug`, a `handler` function, and optional scheduling/retry/concurrency configuration. All jobs are exported from `lib/jobs/import-jobs.ts` and registered in `lib/config/payload-shared-config.ts` via the `ALL_JOBS` array.

```typescript
export const myJob = {
  slug: "my-job",
  handler: async ({ input, job, req }: JobHandlerContext) => {
    const { payload } = req;
    // Do work using payload for database access
    return { output: { success: true } };
  },
  // Optional:
  schedule: [{ cron: "0 * * * *", queue: "maintenance" }],
  retries: 2,
  waitUntil: 300000, // timeout in ms
  concurrency: () => "my-job", // concurrency key
};
```

**Reference:** `lib/jobs/utils/job-context.ts` for the `JobHandlerContext` type.

### Job Lifecycle

Jobs follow a simple state machine managed by Payload's queue:

```
queued --> processing --> completed (auto-deleted)
                    \--> failed (retried if retries > 0, then persisted)
```

**Auto-delete on completion:** Payload removes job records from the database once they finish successfully. This keeps the `payload-jobs` table small and avoids unbounded growth. The consequence is that you cannot query historical job runs -- only pending or failed jobs are visible. Import pipeline jobs store their own progress and results on the `import-jobs` collection, so the import history is preserved independently of the queue.

**Queuing:** Jobs are enqueued via `payload.jobs.queue({ task, input })`. The input is typed per job and persisted as JSON in the queue row.

### How Jobs Are Triggered

Jobs enter the queue through four mechanisms:

| Trigger          | Example                                                       | Mechanism                                                                                                                                                                |
| ---------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Payload hooks    | Import pipeline stages                                        | `afterChange` hook on `import-jobs` calls `StageTransitionService.processStageTransition()`, which looks up the `STAGE_TO_JOB_TYPE` map and calls `payload.jobs.queue()` |
| Scheduled (cron) | `schedule-manager`, `quota-reset`, `cache-cleanup`            | The `schedule` property on the job definition tells Payload to auto-enqueue at the specified cron interval                                                               |
| API routes       | Manual scheduled import trigger, scraper run, data export     | Route handler calls `payload.jobs.queue()` directly                                                                                                                      |
| Other jobs       | `schedule-manager` queues `url-fetch` and `scraper-execution` | A running job calls `payload.jobs.queue()` to spawn child jobs                                                                                                           |

The import pipeline uses hook-driven chaining: when a job completes, it updates the `stage` field on the `import-jobs` document. The `afterChange` hook detects the stage change and queues the next job. The stage graph in `lib/constants/stage-graph.ts` is the single source of truth for valid transitions and stage-to-job mappings.

### Concurrency Control

The `enableConcurrencyControl: true` flag activates Payload's built-in concurrency control. Individual jobs opt in by providing a `concurrency` function that returns a string key. Jobs with the same key are serialized across all workers.

| Job                               | Concurrency Key                     | Reason                                                                         |
| --------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------ |
| `schedule-manager`                | `"schedule-manager"`                | Prevents two workers from triggering the same scheduled imports simultaneously |
| `cleanup-stuck-scheduled-imports` | `"cleanup-stuck-scheduled-imports"` | Avoids duplicate cleanup runs                                                  |
| `cleanup-stuck-scrapers`          | `"cleanup-stuck-scrapers"`          | Avoids duplicate cleanup runs                                                  |

Import pipeline jobs (schema detection, geocoding, event creation) do not use queue-level concurrency. Instead, they rely on the import job's `stage` field for serialization: each stage must complete before the next is queued, enforced by the stage transition graph.

### Retry and Timeout Settings

Jobs that define explicit retry or timeout values:

| Job                    | Retries | Timeout   | Notes                           |
| ---------------------- | ------- | --------- | ------------------------------- |
| `quota-reset`          | 3       | 2 min     | Critical for daily limit resets |
| `cache-cleanup`        | 2       | 5 min     | Non-critical maintenance        |
| `schema-maintenance`   | 2       | 10 min    | Processes up to 100 datasets    |
| `audit-log-ip-cleanup` | 2       | (default) | Privacy compliance              |
| `scraper-repo-sync`    | 2       | (default) | Git clone can be slow           |

Import pipeline jobs (dataset-detection, analyze-duplicates, schema-detection, validate-schema, create-schema-version, geocode-batch, create-events-batch) use Payload's defaults for retries and timeout. They implement their own error handling: on failure, they call `failImportJob()` to set the import job's stage to `FAILED` with an error log, then re-throw the error. The `ErrorRecoveryService` can later retry failed imports from the last successful stage.

### Error Handling Pattern

All job handlers follow a consistent error handling pattern:

1. **Try/catch the entire handler body.** On success, return `{ output: { ... } }`.
2. **On failure in import jobs:** call `failImportJob(payload, importJobId, error, context)` to update the import job record with the error details and stage `FAILED`, then re-throw the error so Payload marks the queue entry as failed.
3. **On failure in system jobs:** log via `logError()`, then either re-throw (to trigger retry) or return a failure output (for non-critical jobs like cache cleanup).
4. **Best-effort cleanup:** File sidecar cleanup and status updates in catch blocks are wrapped in their own try/catch to avoid masking the original error.

### Complete Job Inventory

#### Import Pipeline (7 jobs)

These jobs form a sequential pipeline, each triggered by the previous job's stage transition. They process one import at a time per dataset.

| Job Slug                | Purpose                                                                                                                     | Triggered By                            |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `dataset-detection`     | Reads uploaded file, identifies sheets, creates `import-jobs` records matched to datasets                                   | File upload (hook on `import-files`)    |
| `analyze-duplicates`    | Finds internal duplicates within the file and external duplicates against existing events                                   | Stage transition from dataset detection |
| `detect-schema`         | Streams file batches through `ProgressiveSchemaBuilder` to infer column types, detect field mappings, and identify language | Stage transition                        |
| `validate-schema`       | Compares detected schema against existing dataset schema, checks quotas, determines if approval is needed                   | Stage transition                        |
| `create-schema-version` | Creates a new schema version record after auto-approval or manual approval                                                  | Stage transition                        |
| `geocode-batch`         | Extracts unique location strings, geocodes them in parallel (10 concurrent), stores results map                             | Stage transition                        |
| `create-events-batch`   | Streams file, creates events via bulk SQL insert, tracks quotas, cleans up sidecar files                                    | Stage transition                        |

**Pipeline stage order:** `analyze-duplicates` -> `detect-schema` -> `validate-schema` -> (`await-approval`) -> `create-schema-version` -> `geocode-batch` -> `create-events-batch`

The `await-approval` stage is not a job -- it pauses the pipeline until a user approves the schema changes. The `validate-schema` step can skip directly to `geocode-batch` if no schema changes are detected.

#### URL Fetch and Scheduling (3 jobs)

| Job Slug                  | Schedule                    | Purpose                                                                                                                                             |
| ------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schedule-manager`        | `* * * * *` (every minute)  | Checks all enabled scheduled imports and scrapers, triggers `url-fetch` or `scraper-execution` jobs for those that are due                          |
| `url-fetch`               | On demand                   | Downloads data from a URL, handles authentication, duplicate detection, caching, then creates an `import-files` record to start the import pipeline |
| `process-pending-retries` | `*/5 * * * *` (every 5 min) | Finds failed import jobs scheduled for automatic retry and re-queues them via `ErrorRecoveryService`                                                |

#### Scraper (3 jobs)

| Job Slug                 | Schedule             | Purpose                                                                                                            |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `scraper-execution`      | On demand            | Calls the TimeScrape runner API, records the run result, optionally triggers auto-import from CSV output           |
| `scraper-repo-sync`      | On demand            | Clones a git repo (or reads inline code), parses `scrapers.yml` manifest, upserts/deletes scraper records to match |
| `cleanup-stuck-scrapers` | `0 * * * *` (hourly) | Resets scrapers stuck in "running" status for more than 2 hours                                                    |

#### Data Management (3 jobs)

| Job Slug              | Schedule                                | Purpose                                                                                                      |
| --------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `data-export`         | On demand                               | Creates a ZIP archive of user data, stores it on disk, sends email notification                              |
| `data-export-cleanup` | (not scheduled, triggered periodically) | Deletes expired export ZIP files, marks records as expired, removes old failed/expired records after 30 days |
| `schema-maintenance`  | `0 3 * * *` (daily 3 AM)                | Checks datasets for stale schemas, regenerates from live events when needed                                  |

#### System Maintenance (5 jobs)

| Job Slug                          | Schedule                                | Purpose                                                                                                                     |
| --------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `quota-reset`                     | `0 0 * * *` (daily midnight)            | Resets daily quota counters for all users (file uploads, URL fetches, scraper runs)                                         |
| `cache-cleanup`                   | `0 */6 * * *` (every 6 hours)           | Removes expired entries from URL fetch cache and other cache instances                                                      |
| `audit-log-ip-cleanup`            | `0 4 * * *` (daily 4 AM)                | Nulls raw IP addresses on audit log entries older than 30 days, preserving hashed IPs for correlation                       |
| `execute-account-deletion`        | (not scheduled, triggered periodically) | Finds users whose deletion grace period has expired, transfers public data to system user, permanently deletes private data |
| `cleanup-stuck-scheduled-imports` | `0 * * * *` (hourly)                    | Resets scheduled imports stuck in "running" status for more than 2 hours                                                    |

### Queue Names

Jobs use two queue names for organizational clarity:

- **`default`** -- The schedule-manager and import pipeline jobs run in the default queue.
- **`maintenance`** -- System maintenance jobs (cleanup, quota reset, schema maintenance, audit) run in the maintenance queue.

Both queues are processed by the same worker. The separation exists for logging and potential future prioritization.

## Consequences

- **No external infrastructure.** The job queue lives in PostgreSQL, eliminating Redis/RabbitMQ as dependencies. This aligns with the project's "minimal infrastructure" principle.
- **Auto-delete means no job history.** Successful jobs vanish from the queue table. Import results are preserved on the `import-jobs` collection, but system job execution history is only available in log output.
- **Hook-driven pipeline is implicit.** The import pipeline's chaining via `afterChange` hooks and stage transitions is powerful but non-obvious. The `stage-graph.ts` module serves as the single source of truth and should be consulted before modifying the pipeline.
- **Concurrency control relies on PostgreSQL.** Under high load, the Payload job queue's PostgreSQL-based locking may become a bottleneck. For the current scale (hundreds of imports per day, not thousands), this is adequate.
- **Retry is job-type specific.** Import pipeline jobs handle retries at the application level via `ErrorRecoveryService` rather than queue-level retries, giving finer control over which stage to restart from. System jobs use Payload's built-in retry count.
