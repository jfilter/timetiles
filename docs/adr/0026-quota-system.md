# ADR 0026: Quota System

## Status

Accepted

## Context

TimeTiles allows users to import events from files and URLs, create catalogs, run scrapers, and schedule recurring imports. Without resource limits, a single user could exhaust storage, overwhelm the geocoding pipeline, or monopolize background job capacity. The platform needs a fair-usage system that scales limits with user trust while allowing per-user overrides.

A separate concern is abuse prevention. Short-burst rate limiting (requests per second) and long-term quota enforcement (uploads per day, total events) serve different purposes and operate at different time scales, so the system needs both.

## Decision

### Trust Levels

Every user has a numeric `trustLevel` (0--5) that determines their default quotas. Admins assign trust levels through the Payload dashboard; self-registered users start at BASIC (1).

| Level | Name       | Intended Audience                                      |
| ----- | ---------- | ------------------------------------------------------ |
| 0     | Untrusted  | New or suspicious users with minimal access            |
| 1     | Basic      | Self-registered users with conservative limits         |
| 2     | Regular    | Standard users with normal operational limits          |
| 3     | Trusted    | Trusted users with enhanced access                     |
| 4     | Power User | Advanced users with generous allowances                |
| 5     | Unlimited  | Administrators (all quotas set to -1 except file size) |

**Reference:** `lib/constants/quota-constants.ts` (`TRUST_LEVELS`, `DEFAULT_QUOTAS`)

### Quota Types

Ten quotas are defined in the `QUOTAS` registry. Each entry links a limit field, a usage-tracking field, a daily-reset flag, and an error message template.

| Quota Key              | Limit Field            | Usage Field              | Daily | Description                        |
| ---------------------- | ---------------------- | ------------------------ | ----- | ---------------------------------- |
| `ACTIVE_SCHEDULES`     | `maxActiveSchedules`   | `currentActiveSchedules` | No    | Concurrent scheduled imports       |
| `URL_FETCHES_PER_DAY`  | `maxUrlFetchesPerDay`  | `urlFetchesToday`        | Yes   | URL fetches from scheduled imports |
| `FILE_UPLOADS_PER_DAY` | `maxFileUploadsPerDay` | `fileUploadsToday`       | Yes   | File uploads                       |
| `EVENTS_PER_IMPORT`    | `maxEventsPerImport`   | (none)                   | No    | Row count in a single import file  |
| `TOTAL_EVENTS`         | `maxTotalEvents`       | `totalEventsCreated`     | No    | Lifetime event count               |
| `IMPORT_JOBS_PER_DAY`  | `maxImportJobsPerDay`  | `importJobsToday`        | Yes   | Import jobs created                |
| `FILE_SIZE_MB`         | `maxFileSizeMB`        | (none)                   | No    | Maximum upload file size           |
| `CATALOGS_PER_USER`    | `maxCatalogsPerUser`   | `currentCatalogs`        | No    | Catalogs owned                     |
| `SCRAPER_REPOS`        | `maxScraperRepos`      | `currentScraperRepos`    | No    | Scraper repositories owned         |
| `SCRAPER_RUNS_PER_DAY` | `maxScraperRunsPerDay` | `scraperRunsToday`       | Yes   | Scraper executions                 |

Two quotas (`EVENTS_PER_IMPORT` and `FILE_SIZE_MB`) have no usage field. They are check-only: the system compares the incoming value against the limit without tracking a running counter.

### Default Limits by Trust Level

| Quota             | Untrusted | Basic | Regular | Trusted | Power User | Unlimited |
| ----------------- | --------- | ----- | ------- | ------- | ---------- | --------- |
| Active schedules  | 0         | 1     | 5       | 20      | 100        | -1        |
| URL fetches/day   | 0         | 5     | 20      | 100     | 500        | -1        |
| File uploads/day  | 1         | 3     | 10      | 50      | 200        | -1        |
| Events per import | 100       | 1,000 | 10,000  | 50,000  | 200,000    | -1        |
| Total events      | 100       | 5,000 | 50,000  | 500,000 | 2,000,000  | -1        |
| Import jobs/day   | 1         | 5     | 20      | 100     | 500        | -1        |
| File size (MB)    | 1         | 10    | 50      | 100     | 500        | 1,000     |
| Catalogs          | 1         | 2     | 5       | 20      | 100        | -1        |
| Scraper repos     | 0         | 0     | 0       | 3       | 10         | -1        |
| Scraper runs/day  | 0         | 0     | 0       | 10      | 50         | -1        |

A value of -1 means unlimited. File size never uses -1; even Unlimited users are capped at 1,000 MB.

**Reference:** `lib/constants/quota-constants.ts` (`DEFAULT_QUOTAS`)

### Custom Overrides

Quotas are resolved in three layers, each overriding the previous:

1. **Trust-level defaults** from `DEFAULT_QUOTAS[trustLevel]`.
2. **Per-user `quotas` group** on the Users collection. Admins can set individual limits in the dashboard (e.g., raise one user's `maxTotalEvents` without changing their trust level). Null fields fall back to the trust-level default.
3. **`customQuotas` JSON field** on the Users collection. A free-form JSON object that overrides everything. Only visible to admins. Validated at runtime: keys must match `UserQuotas` field names, values must be numbers.

When an admin changes a user's trust level, the `quotas` group is automatically re-initialized from the new trust level's defaults, unless `customQuotas` is also provided in the same update. Changes to trust level, role, and custom quotas are audit-logged.

**Reference:** `QuotaService.getEffectiveQuotas()`, `lib/collections/users.ts` (beforeChange hook)

### Usage Tracking: The UserUsage Collection

Usage counters are stored in a dedicated `user-usage` collection, separate from the Users collection. Each user has at most one record (enforced by a unique index on the `user` field).

**Why a separate collection:** When usage counters were embedded in the Users collection and versioning was enabled, calling `payload.update()` on user documents triggered session clearing due to PostgreSQL cascade constraints on `users_sessions`. Separating usage data eliminates this risk.

The collection stores:

- **Daily counters** (reset at midnight UTC): `urlFetchesToday`, `fileUploadsToday`, `importJobsToday`, `scraperRunsToday`
- **Cumulative counters** (never automatically reset): `totalEventsCreated`, `currentActiveSchedules`, `currentCatalogs`, `currentScraperRepos`
- **Reset tracking**: `lastResetDate` records the last daily reset

Records are created lazily via `QuotaService.getOrCreateUsageRecord()` on first quota check, avoiding FK constraint issues during user creation.

**Reference:** `lib/collections/user-usage.ts`, `QuotaService.getOrCreateUsageRecord()`

### QuotaService

`QuotaService` is stateless. A new instance is created per call via `createQuotaService(payload)`.

Three enforcement methods serve different use cases:

| Method                              | Use Case                                                                                                                        |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `checkAndIncrementUsage()`          | Default. Single atomic SQL statement that increments only if below limit. Prevents TOCTOU races.                                |
| `checkQuota()` + `incrementUsage()` | When check and increment happen in separate Payload lifecycle hooks (e.g., `beforeChange` validates, `afterChange` increments). |
| `incrementUsage()` alone            | Post-hoc tracking where the operation already succeeded (e.g., batch event creation).                                           |

Atomic operations use Drizzle's SQL builder to issue `UPDATE ... SET col = COALESCE(col, 0) + amount WHERE col + amount <= limit` in a single statement. `decrementUsage()` uses `GREATEST(0, col - amount)` to prevent negative values.

For daily quotas, `incrementUsage()` atomically resets all stale daily counters in the same UPDATE statement using a `CASE WHEN lastResetDate < CURRENT_DATE` guard.

**Reference:** `lib/services/quota-service.ts`

### Enforcement Points

Quotas are enforced at collection hooks, job handlers, and the configure-import service:

| Location                                         | Quota(s) Checked                                                              | Method                                                     |
| ------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `collections/import-files.ts` (beforeChange)     | `FILE_UPLOADS_PER_DAY`, `IMPORT_JOBS_PER_DAY`, `TOTAL_EVENTS`, `FILE_SIZE_MB` | `checkQuota()` + `getEffectiveQuotas()`                    |
| `collections/import-files.ts` (afterChange)      | `FILE_UPLOADS_PER_DAY`                                                        | `incrementUsage()`                                         |
| `collections/events/hooks.ts` (beforeChange)     | `TOTAL_EVENTS`                                                                | `checkQuota()`                                             |
| `collections/catalogs.ts` (beforeChange)         | `CATALOGS_PER_USER`                                                           | `checkAndIncrementUsage()`                                 |
| `collections/catalogs.ts` (afterDelete)          | `CATALOGS_PER_USER`                                                           | `decrementUsage()`                                         |
| `collections/scheduled-imports/` (beforeChange)  | `ACTIVE_SCHEDULES`                                                            | `checkQuota()`                                             |
| `collections/scheduled-imports/` (afterChange)   | `ACTIVE_SCHEDULES`                                                            | `incrementUsage()` / `decrementUsage()`                    |
| `collections/scraper-repos.ts` (beforeChange)    | `SCRAPER_REPOS`                                                               | `checkAndIncrementUsage()`                                 |
| `collections/scraper-repos.ts` (afterDelete)     | `SCRAPER_REPOS`                                                               | `decrementUsage()`                                         |
| `collections/import-jobs/hooks.ts` (afterChange) | `IMPORT_JOBS_PER_DAY`                                                         | `incrementUsage()`                                         |
| `jobs/handlers/url-fetch-job/`                   | `URL_FETCHES_PER_DAY`                                                         | `checkAndIncrementUsage()`                                 |
| `jobs/handlers/validate-schema-job.ts`           | `EVENTS_PER_IMPORT`, `TOTAL_EVENTS`                                           | `checkQuota()`                                             |
| `jobs/handlers/create-events-batch-job.ts`       | `EVENTS_PER_IMPORT`, `TOTAL_EVENTS`                                           | `checkQuota()` + `incrementUsage()`                        |
| `jobs/handlers/scraper-execution-job.ts`         | `SCRAPER_RUNS_PER_DAY`                                                        | `checkAndIncrementUsage()` + `decrementUsage()` on failure |
| `import/configure-service.ts`                    | `ACTIVE_SCHEDULES`                                                            | `validateQuota()`                                          |

### Frontend Exposure

The frontend receives quota information through two channels:

1. **`GET /api/quotas`** -- Returns all quota statuses (used/limit/remaining) for the authenticated user. Uses a per-request cache so all checks share a single database lookup. High limits are capped at 10,000 and file size at 100 MB in the response to prevent identification of admin accounts.

2. **`quotaInfo` virtual field on ImportFiles** -- An `afterRead` hook attaches file upload, import job, and total event quota status directly to import file records, so the import UI can display limits without a separate API call.

Both channels omit trust levels, exact reset times, and internal quota architecture to avoid exposing the scoring system.

**Reference:** `app/api/quotas/route.ts`, `lib/collections/import-files.ts` (quotaInfo virtual field)

### Daily Reset

Daily counters reset at midnight UTC through two complementary mechanisms:

1. **Background job (`quota-reset`)**: Runs on a `0 0 * * *` cron schedule. Calls `QuotaService.resetAllDailyCounters()`, which issues a single bulk update across all `user-usage` records. Retries up to 3 times on failure. Runs in the `maintenance` queue.

2. **Lazy reset in `incrementUsage()`**: When incrementing a daily counter, the SQL statement checks whether `lastResetDate < CURRENT_DATE`. If stale, it resets all daily counters atomically in the same UPDATE. This handles edge cases where the cron job was delayed or a user acts before it runs.

**Reference:** `lib/jobs/handlers/quota-reset-job/index.ts`, `QuotaService.incrementUsage()`

### Quotas vs Rate Limiting

The quota system works alongside `RateLimitService` but at a different scale:

| Aspect       | QuotaService                  | RateLimitService                  |
| ------------ | ----------------------------- | --------------------------------- |
| Purpose      | Fair usage, capacity planning | Abuse prevention, DDoS protection |
| Storage      | Database (persistent)         | In-memory (ephemeral)             |
| Scope        | Per user ID                   | Per IP address                    |
| Time windows | Hours to lifetime             | Seconds to hours                  |
| Reset        | Fixed (midnight UTC)          | Sliding windows                   |

Both checks typically run together at enforcement points: rate limits first (fast, in-memory), then quotas (accurate, database-backed). Rate limit configurations are also defined per trust level in `RATE_LIMITS_BY_TRUST_LEVEL`.

**Reference:** `lib/services/rate-limit-service.ts`, `lib/constants/quota-constants.ts`

## Consequences

- Every resource-consuming operation has a quota gate, preventing any single user from monopolizing the system
- The trust-level model gives admins a single knob to adjust a user's overall access, while per-user overrides handle exceptions
- Separating usage into its own collection avoids the session-clearing bug and allows independent optimization of the high-frequency counter updates
- Atomic SQL updates prevent race conditions from concurrent requests without requiring advisory locks or serializable transactions
- The lazy daily reset in `incrementUsage()` makes the system self-healing even if the cron job fails
- The security-conscious API response (capped limits, no trust level exposure) prevents privilege enumeration but means the frontend cannot show exact limits for high-trust users
- Check-only quotas (file size, events per import) avoid unnecessary counter maintenance for values that are validated once per operation
