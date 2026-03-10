# ADR 0012: Scheduled Imports and Webhooks

## Status

Accepted

## Context

TimeTiles supports automated data ingestion from remote URLs on a recurring basis. Users configure a schedule, provide a source URL with optional authentication, and the system periodically fetches the file and feeds it into the standard import pipeline (see ADR 0004). External systems can also trigger imports on demand via webhooks. This ADR documents the scheduling, webhook, authentication, and security mechanisms.

## Decision

### Schedule Types

Each scheduled import (`scheduled-imports` collection) uses one of two schedule types:

| Type      | Field            | Options                                | Example                       |
| --------- | ---------------- | -------------------------------------- | ----------------------------- |
| Frequency | `frequency`      | `hourly`, `daily`, `weekly`, `monthly` | Run daily at midnight UTC     |
| Cron      | `cronExpression` | Standard 5-field cron                  | `0 */6 * * *` (every 6 hours) |

Source: `lib/collections/scheduled-imports/fields/schedule-fields.ts`

The `scheduleType` select field determines which is active. A `beforeChange` hook clears the unused field when the type changes.

Source: `lib/collections/scheduled-imports/hooks.ts` (`clearScheduleTypeFields`)

### Feature Flag Gates

Two feature flags control the system:

| Flag                          | Guards                         | Effect When Disabled                                  |
| ----------------------------- | ------------------------------ | ----------------------------------------------------- |
| `enableScheduledImports`      | `create` access control        | Users cannot create new scheduled imports             |
| `enableScheduledJobExecution` | `schedule-manager-job` handler | Schedule manager returns immediately without scanning |

Source: `lib/collections/scheduled-imports/index.ts` (access.create), `lib/jobs/handlers/schedule-manager-job.ts`

### Execution Flow

```
ScheduleService (singleton, 60s interval)
  --> Queues schedule-manager job via Payload job queue
    --> schedule-manager-job handler runs:
      1. Checks enableScheduledJobExecution feature flag
      2. Queries all enabled scheduled-imports (limit 1000)
      3. For each: checks shouldRunNow() against nextRun/lastRun
      4. Skips if lastStatus === "running" (concurrency guard)
      5. Sets lastStatus to "running" BEFORE queueing
      6. Queues url-fetch job with scheduledImportId, sourceUrl, authConfig, etc.
      7. Calculates and stores nextRun for the next cycle
```

The `ScheduleService` is a singleton with an in-memory interval timer and `isRunning` flag. It depends on the single-process architecture (see ADR 0001). It registers SIGINT/SIGTERM handlers for graceful shutdown.

Source: `lib/services/schedule-service.ts`, `lib/jobs/handlers/schedule-manager-job.ts`

### URL Fetch Job

The `url-fetch` job handler downloads the file and creates an `import-files` record, triggering the standard import pipeline:

1. Loads scheduled import config (aborts if disabled or not found)
2. Checks daily URL fetch quota via `QuotaService`
3. Builds auth headers from `authConfig`
4. Fetches URL with retry (configurable max retries, exponential backoff)
5. Calculates SHA-256 content hash for deduplication
6. If duplicate content detected and `skipDuplicateChecking` is false, skips import
7. Creates `import-files` record with file data
8. Queues `dataset-detection` job to start the pipeline
9. Updates scheduled import with success/failure status and execution history

Source: `lib/jobs/handlers/url-fetch-job/index.ts`, `lib/jobs/handlers/url-fetch-job/fetch-utils.ts`

### Concurrency Prevention

Three mechanisms prevent duplicate executions:

| Mechanism                        | Location                                 | How It Works                                                  |
| -------------------------------- | ---------------------------------------- | ------------------------------------------------------------- |
| `lastStatus === "running"` check | `schedule-manager-job.ts`, webhook route | Skips queueing if import is already running                   |
| Status set before queue          | Both schedule-manager and webhook        | `lastStatus` set to `"running"` before `payload.jobs.queue()` |
| Stuck import cleanup             | `cleanup-stuck-scheduled-imports-job.ts` | Resets imports stuck in `"running"` for >2 hours              |

### Webhook Triggers

Webhooks allow external systems to trigger imports via HTTP POST.

**Token generation**: When `webhookEnabled` is set to true, the `beforeChange` hook generates a 32-byte random token via `crypto.randomBytes(32).toString("hex")`. The token is regenerated on re-enable for security rotation. The `webhookToken` field is hidden from the admin UI (`admin: { hidden: true }`).

Source: `lib/collections/scheduled-imports/hooks.ts` (`handleWebhookToken`), `lib/collections/scheduled-imports/fields/webhook-fields.ts`

**Endpoint**: `POST /api/webhooks/trigger/[token]`

The endpoint performs these checks in order:

1. Dual-window rate limiting (see below)
2. Token lookup against `scheduled-imports` collection
3. Returns identical error for invalid token and disabled webhook (prevents token enumeration)
4. Checks `lastStatus !== "running"` (concurrency guard)
5. Sets `lastStatus` to `"running"`, queues `url-fetch` job with `triggeredBy: "webhook"`

Source: `app/api/webhooks/trigger/[token]/route.ts`

**Rate limits**:

| Window | Limit            | Purpose                                   |
| ------ | ---------------- | ----------------------------------------- |
| Burst  | 1 per 10 seconds | Prevents race conditions from rapid calls |
| Hourly | 5 per hour       | Prevents abuse                            |

Source: `lib/services/rate-limit-service.ts` (`RATE_LIMITS.WEBHOOK_TRIGGER`)

### Authentication for URL Fetching

Four authentication types are supported, configured in the `authConfig` group field:

| Type      | Fields                                         | Header Produced                 |
| --------- | ---------------------------------------------- | ------------------------------- |
| `none`    | --                                             | User-Agent only                 |
| `api-key` | `apiKey`, `apiKeyHeader` (default `X-API-Key`) | `{apiKeyHeader}: {apiKey}`      |
| `bearer`  | `bearerToken`                                  | `Authorization: Bearer {token}` |
| `basic`   | `username`, `password`                         | `Authorization: Basic {base64}` |

A `customHeaders` JSON field allows arbitrary additional headers for any auth type.

Source: `lib/collections/scheduled-imports/fields/auth-fields.ts`, `lib/jobs/handlers/url-fetch-job/auth.ts`

**Encryption at rest**: Sensitive fields (`apiKey`, `bearerToken`, `password`) are encrypted using AES-256-GCM before database storage. Encryption is transparent via Payload field hooks (`beforeChange` encrypts, `afterRead` decrypts). The encryption key is derived from `PAYLOAD_SECRET` using `scrypt` with a static salt. Encrypted values are stored as `iv:authTag:ciphertext` in hex encoding. The `isEncrypted()` function detects already-encrypted values to support gradual migration.

Source: `lib/utils/encryption.ts`, `lib/collections/scheduled-imports/fields/auth-fields.ts` (`credentialHooks`)

### URL Security

`validateUrl()` enforces two rules:

1. **Protocol whitelist**: Only `http://` and `https://` URLs are accepted
2. **SSRF prevention**: `isPrivateUrl()` rejects URLs targeting private/internal addresses (127.x, 10.x, 172.16-31.x, 192.168.x, localhost, ::1, link-local, ULA, etc.) via hostname pattern matching without DNS resolution

Source: `lib/collections/scheduled-imports/validation.ts`, `lib/utils/url-validation.ts`

Additional URL fetch protections:

| Protection                 | Implementation                                                                     | Source                                                                                                                       |
| -------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Content-hash deduplication | SHA-256 hash compared against recent completed imports in same catalog             | `url-fetch-job/fetch-utils.ts` (`calculateDataHash`), `url-fetch-job/scheduled-import-utils.ts` (`checkForDuplicateContent`) |
| Configurable max file size | `advancedOptions.maxFileSizeMB` per schedule; streaming size check during download | `url-fetch-job/fetch-utils.ts` (`readResponseBody`)                                                                          |
| Configurable timeout       | `advancedOptions.timeoutMinutes` (default 30); `AbortController` signal            | `url-fetch-job/index.ts` (`prepareFetchOptions`)                                                                             |

### Quota Enforcement

Two quota types govern scheduled imports:

| Quota                 | Tracked Via                                                  | Enforcement Point                                 |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------- |
| `ACTIVE_SCHEDULES`    | Increment/decrement in `afterChange` and `afterDelete` hooks | `beforeChange` hook checks quota before enabling  |
| `URL_FETCHES_PER_DAY` | `QuotaService.incrementUsage()` in url-fetch job             | Checked before each fetch; resets at midnight UTC |

The `afterChange` hook increments usage when a schedule is created (enabled) or re-enabled, and decrements when disabled. The `afterDelete` hook decrements when an enabled schedule is deleted. Quota is charged to the schedule owner (`createdBy`), not the acting user.

Source: `lib/collections/scheduled-imports/index.ts` (hooks), `lib/jobs/handlers/url-fetch-job/index.ts` (`checkAndTrackQuota`)

## Consequences

- The `ScheduleService` singleton and its in-memory `isRunning` flag depend on the single-process architecture (ADR 0001). Multi-process deployment would require a distributed lock to prevent duplicate schedule-manager runs.
- The `lastStatus === "running"` concurrency guard is optimistic, not transactional. A crash between setting the status and queueing the job could leave an import stuck in "running" state. The `cleanup-stuck-scheduled-imports` job mitigates this by resetting imports stuck for more than 2 hours.
- Webhook rate limits are enforced in-memory via `RateLimitService`, so they reset on process restart and do not span multiple processes.
- SSRF prevention via `isPrivateUrl()` uses hostname pattern matching only. It does not perform DNS resolution, so it cannot catch DNS rebinding attacks where a public hostname resolves to a private IP. This is an accepted trade-off to avoid blocking I/O in the validation path.
- Credential encryption uses a static salt with `scrypt` key derivation. This is acceptable because `PAYLOAD_SECRET` is already high-entropy, but rotating the secret requires re-encrypting all stored credentials.
- Content-hash deduplication only checks against completed imports in the same catalog. Cross-catalog deduplication is not supported.
