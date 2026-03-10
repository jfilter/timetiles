# ADR 0004: Import Pipeline

## Status

Accepted

## Context

TimeTiles imports events from CSV, Excel, and ODS files. Imports can be triggered by a user uploading a file or by a scheduled URL fetch. Each import may contain multiple sheets, each producing a separate import job. The pipeline must handle schema detection, user approval for breaking changes, geocoding via external APIs with rate limits, and batch event creation -- all while tracking progress and recovering from failures.

## Decision

The import pipeline is a **stage-based state machine** driven by Payload CMS hooks and the Payload job queue. Each import job document holds its current stage. When a stage completes, the job handler updates the stage field, which triggers an `afterChange` hook that validates the transition and queues the next job.

### Pipeline Stages

```
                                 +----------+
                                 |  FAILED  |
                                 +----------+
                                   ^  ^  ^
                                   |  |  |  (any stage can fail)
                                   |  |  |
+--------------------+    +---------------+    +-----------------+
| ANALYZE_DUPLICATES |--->| DETECT_SCHEMA |--->| VALIDATE_SCHEMA |
+--------------------+    +---------------+    +-----------------+
                                                   |         |
                                          (breaking |         | (no approval
                                           changes) |         |  needed)
                                                   v         |
                                          +-----------------+ |
                                          | AWAIT_APPROVAL  | |
                                          +-----------------+ |
                                                   |         |
                                                   v         v
                                          +------------------------+
                                          | CREATE_SCHEMA_VERSION  |
                                          +------------------------+
                                                   |
                                                   v
                                          +---------------+
                                          | GEOCODE_BATCH |
                                          +---------------+
                                                   |
                                                   v
                                          +---------------+
                                          | CREATE_EVENTS |
                                          +---------------+
                                                   |
                                                   v
                                          +-----------+
                                          | COMPLETED |
                                          +-----------+
```

### Stage-to-Job Mapping

| Stage                   | Job Type                | Batch Input      | Description                                            |
| ----------------------- | ----------------------- | ---------------- | ------------------------------------------------------ |
| `analyze-duplicates`    | `analyze-duplicates`    | No               | Detects duplicate rows against existing events         |
| `detect-schema`         | `detect-schema`         | `batchNumber: 0` | Infers column types and field mappings                 |
| `validate-schema`       | `validate-schema`       | No               | Checks schema against existing dataset schema          |
| `await-approval`        | _(none -- paused)_      | --               | User reviews breaking schema changes in UI             |
| `create-schema-version` | `create-schema-version` | No               | Persists approved schema to dataset-schemas collection |
| `geocode-batch`         | `geocode-batch`         | `batchNumber: 0` | Geocodes unique location strings                       |
| `create-events`         | `create-events`         | `batchNumber: 0` | Creates event documents in batches                     |
| `completed`             | _(none -- terminal)_    | --               | Pipeline finished                                      |
| `failed`                | _(none -- terminal)_    | --               | Error occurred; eligible for recovery                  |

Source: `lib/constants/import-constants.ts` (`PROCESSING_STAGE`, `JOB_TYPES`, `BATCH_SIZES`)

### Stage Transition Mechanism

Three components work together to advance the pipeline:

1. **Job handlers** (`lib/jobs/handlers/`) -- Each handler performs its work and then updates the import job's `stage` field to the next stage via `payload.update()`.

2. **afterChange hook** (`lib/collections/import-jobs/hooks.ts`) -- Fires on every import-jobs update. On creation, it queues the first job (`analyze-duplicates`). On update, it delegates to `StageTransitionService.processStageTransition()`, which validates the transition and queues the appropriate next job. If the transition fails, the hook marks the job as `FAILED`.

3. **StageTransitionService** (`lib/services/stage-transition.ts`) -- Validates transitions against a static map of allowed transitions (`VALID_STAGE_TRANSITIONS`). Uses an in-memory `Set<string>` keyed by `{jobId}-{fromStage}-{toStage}` to prevent duplicate job queueing within the same process. This relies on the single-process architecture (see ADR 0001).

Special cases handled by the hook:

- **Schema approval**: When a user sets `schemaValidation.approved = true` while in `AWAIT_APPROVAL`, the `beforeChange` hook automatically advances the stage to `CREATE_SCHEMA_VERSION`.
- **Terminal states**: `COMPLETED` jobs cannot be modified (except by admins). `FAILED` jobs can only transition to specific recovery stages.

### Entry Points

**File upload (interactive)**:

```
User uploads CSV/Excel
  --> ImportFile created (import-files collection)
    --> afterChange hook queues dataset-detection job
      --> dataset-detection reads file, detects sheets
        --> Creates one ImportJob per sheet (stage: ANALYZE_DUPLICATES)
          --> afterChange hook queues analyze-duplicates job
            --> Pipeline continues through stages
```

Source: `lib/collections/import-files.ts` (afterChange hook), `lib/jobs/handlers/dataset-detection-job.ts`

**Scheduled import (automated)**:

```
schedule-manager-job runs periodically
  --> Scans enabled scheduled-imports where nextRun <= now
    --> Queues url-fetch job for each due schedule
      --> url-fetch downloads file, creates ImportFile
        --> Queues dataset-detection job
          --> Same pipeline as file upload
```

The schedule-manager-job checks a feature flag (`enableScheduledJobExecution`) before processing. It sets `lastStatus: "running"` before queueing to prevent duplicate execution. The url-fetch job supports authentication headers, content-hash deduplication, HTTP caching, configurable timeouts, and quota enforcement.

Source: `lib/jobs/handlers/schedule-manager-job.ts`, `lib/jobs/handlers/url-fetch-job/`, `lib/collections/scheduled-imports/index.ts`

### Geocoding Architecture

The geocoding subsystem is a multi-provider facade with four components:

| Component             | File                                              | Responsibility                             |
| --------------------- | ------------------------------------------------- | ------------------------------------------ |
| `GeocodingService`    | `lib/services/geocoding/geocoding-service.ts`     | Public API facade; lazy initialization     |
| `ProviderManager`     | `lib/services/geocoding/provider-manager.ts`      | Loads providers from DB, sorts by priority |
| `ProviderRateLimiter` | `lib/services/geocoding/provider-rate-limiter.ts` | Per-provider token bucket rate limiting    |
| `CacheManager`        | `lib/services/geocoding/cache-manager.ts`         | Read/write to `location-cache` collection  |

Provider configuration:

- Providers are configured in the Payload admin panel (`geocoding-providers` collection)
- Three types supported: Nominatim (default, 1 req/s), Google Maps (50 req/s default), OpenCage (10 req/s default)
- `ProviderManager` sorts enabled providers by priority (lower number = higher priority)
- If the primary provider fails, the service falls back to the next provider (when `fallbackEnabled` is true)
- If no providers are configured in the database, Nominatim is used as the default fallback

Rate limiting:

- `ProviderRateLimiter` is a singleton with in-memory state (see ADR 0001)
- Each provider has a configurable `requestsPerSecond` limit
- `waitForSlot()` sleeps until a request slot is available, enforcing minimum intervals between requests
- Nominatim's 1 req/s limit is hardcoded as the conservative default

Caching:

- Geocoding results are stored in the `location-cache` collection (database-backed)
- Addresses are normalized before cache lookup to improve hit rates
- Cache TTL is configurable (default 30 days)
- The geocode-batch job extracts unique location strings from all rows, so each address is geocoded at most once per import

### Batch Processing

Large imports are processed in configurable batches to manage memory and provide progress feedback:

| Operation             | Default Batch Size | Environment Variable            |
| --------------------- | ------------------ | ------------------------------- |
| Duplicate analysis    | 5,000 rows         | `BATCH_SIZE_DUPLICATE_ANALYSIS` |
| Schema detection      | 10,000 rows        | `BATCH_SIZE_SCHEMA_DETECTION`   |
| Event creation        | 1,000 rows         | `BATCH_SIZE_EVENT_CREATION`     |
| Database chunk writes | 1,000 rows         | `BATCH_SIZE_DATABASE_CHUNK`     |

Source: `lib/constants/import-constants.ts` (`BATCH_SIZES`)

`ProgressTrackingService` (`lib/services/progress-tracking.ts`) updates the import job's `progress` field with per-stage metrics including items processed, processing rate (rows/second), and estimated completion time. The geocode-batch job updates progress every 10 locations. The create-events job updates progress per batch.

### Error Recovery

`ErrorRecoveryService` (`lib/services/error-recovery.ts`) provides both automatic and manual recovery:

**Error classification** -- Errors are categorized by analyzing the error message:

| Pattern                           | Classification         | Retryable |
| --------------------------------- | ---------------------- | --------- |
| connection, timeout, econnrefused | `recoverable`          | Yes       |
| memory, resource                  | `recoverable`          | Yes       |
| rate limit, 429                   | `recoverable`          | Yes       |
| enoent, file not found            | `permanent`            | No        |
| permission, unauthorized          | `permanent`            | No        |
| quota, limit exceeded             | `user-action-required` | No        |
| schema, validation                | `user-action-required` | Yes       |
| _(unknown)_                       | `recoverable`          | Yes       |

**Automatic retry**:

- Exponential backoff: 30s base delay, 2x multiplier, 5-minute maximum
- Maximum 3 retries per job (configurable via `RetryConfig`)
- `processPendingRetries()` runs every 5 minutes, scans for failed jobs with `nextRetryAt <= now`
- Recovery restarts from the stage after `lastSuccessfulStage` (or from the beginning if unset)
- Quota is checked before each retry to prevent abuse

**Manual recovery**:

- `resetJobToStage(payload, jobId, targetStage, clearRetries?)` allows operators to force a job to any stage
- The stage update triggers the afterChange hook, which automatically queues the appropriate job
- `getRecoveryRecommendations()` returns actionable advice for all failed jobs
- Valid recovery stages from `FAILED`: `analyze-duplicates`, `detect-schema`, `validate-schema`, `geocode-batch`

**Recovery flow**:

```
Job fails --> stage set to FAILED, error logged
  --> processPendingRetries (periodic) or manual resetJobToStage
    --> classifyError determines if retryable
      --> job.stage updated to recovery stage
        --> afterChange hook queues job via StageTransitionService
          --> Pipeline resumes from recovery stage
```

## Consequences

- The hook-driven design means adding a new stage requires changes in three places: constants (`PROCESSING_STAGE`, `JOB_TYPES`), the transition map (`VALID_STAGE_TRANSITIONS`), and the stage-to-job switch in `StageTransitionService.queueStageJob()`.
- The `AWAIT_APPROVAL` stage halts the pipeline until a user acts. For scheduled imports, the `autoApproveSchema` option can bypass this pause.
- Geocoding is the primary bottleneck for large imports due to external API rate limits. The unique-location extraction step mitigates this by deduplicating addresses before geocoding.
- Error recovery defaults to optimistic (unknown errors are retryable). This trades occasional wasted retries for better resilience against transient failures.
- Progress tracking uses a read-modify-write pattern without locking on the job's `progress` field. This is safe under the single-process model (see ADR 0001) but would need optimistic locking for multi-process deployments.
- The Payload job queue is database-backed, so jobs survive process restarts. However, the in-memory transition lock (`StageTransitionService.transitioningJobs`) is lost on restart, which is acceptable because the lock is only held for the duration of a single async operation.
