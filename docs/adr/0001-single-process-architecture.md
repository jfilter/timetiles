# ADR 0001: Single-Process Architecture

## Status

Accepted

## Context

TimeTiles uses several in-memory data structures for performance-critical operations: schedule management, view caching, geocoding throttling, and stage transition locking. Most of these structures live in module-level variables or class-level static fields within a single Node.js process.

This was a deliberate trade-off: in-memory state is fast and simple, and the application currently runs as a single Next.js process (or a single container).

## Decision

TimeTiles assumes a **single Node.js process** for its server runtime. All in-memory state is process-local and not synchronized across processes.

## What Is Safe for Multi-Process

- **Payload job queue** — DB-backed (`payload_jobs` table), dequeued atomically. Jobs won't be processed twice.
- **Database reads/writes** — PostgreSQL handles concurrent access. Most collection CRUD is safe.
- **Stateless services** — `QuotaService`, `AccountDeletionService`, `DataExportService`, `SystemUserService` create fresh instances per call with no shared state.

## Components That Depend on Single-Process

### In-Memory State

| Component                  | File                                              | State                                                                   | What Breaks with 2+ Processes                                                               |
| -------------------------- | ------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **RateLimitService**       | `lib/services/rate-limit-service.ts`              | `memory` backend only: `Map<string, RateLimitEntry>` + cleanup interval | If `RATE_LIMIT_BACKEND=memory` in a multi-worker deploy, rate limits split across processes |
| **ScheduleService**        | `lib/services/schedule-service.ts`                | Interval timer + `isRunning` flag + signal handlers                     | Each process runs its own scheduler — duplicate jobs get queued                             |
| **StageTransitionService** | `lib/services/stage-transition.ts`                | `Set<string>` of in-flight job IDs                                      | Concurrent transitions for the same job allowed across processes                            |
| **ProviderRateLimiter**    | `lib/services/geocoding/provider-rate-limiter.ts` | `Map<string, ProviderState>` per geocoding provider                     | External API rate limits exceeded — e.g., 2 processes each send 1 req/s to a 1 req/s API    |
| **ViewResolver**           | `lib/services/view-resolver.ts`                   | `Map` caches for domain/slug/default views (5-min TTL)                  | Stale views served after admin changes until per-process TTL expires                        |
| **FeatureFlagService**     | `lib/services/feature-flag-service.ts`            | Module-level `cachedFlags` + timestamp (1-min TTL)                      | Each process caches flags independently; settings changes propagate unevenly                |
| **CacheManager**           | `lib/services/cache/manager.ts`                   | Static `instances` Map + `MemoryCacheStorage` LRU                       | No cache sharing — same data fetched redundantly per process                                |
| **FileSystemCacheStorage** | `lib/services/cache/storage/file-system.ts`       | Cleanup interval + index `Map`                                          | Concurrent cleanup of shared files could race                                               |

### Local Filesystem Assumptions

| Component               | File                                  | Assumption                                            | What Breaks with 2+ Processes                                                                 |
| ----------------------- | ------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Import file uploads** | `lib/collections/import-files.ts`     | Uploaded files stored in `UPLOAD_DIR/import-files/`   | Job handler on process A may not find file uploaded via process B if filesystem is not shared |
| **Data exports**        | `lib/services/data-export-service.ts` | Export archives written to `DATA_EXPORT_DIR`          | Download request may hit process that didn't create the file                                  |
| **Media uploads**       | Payload built-in                      | Media stored on local disk via Payload upload adapter | Same shared-filesystem requirement                                                            |

### Read-Modify-Write Without Locking

These patterns work correctly under single-process concurrency (Node.js event loop serializes I/O callbacks) but could lose updates under multi-process:

| Component                   | File                                | Pattern                                                                                               |
| --------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
| **ProgressTrackingService** | `lib/services/progress-tracking.ts` | Reads job progress → deserializes → modifies stages → writes back. No transaction or optimistic lock. |

## Scaling Path

If horizontal scaling becomes necessary, the following changes would be needed:

### Priority 1: Critical (breaks correctness)

1. **ScheduleService** — Add a distributed lock (PostgreSQL advisory lock or Redis `SET NX`) so only one process runs the scheduler
2. **StageTransitionService** — Replace in-memory `Set` with a PostgreSQL advisory lock per job ID
3. **RateLimitService** — Set `RATE_LIMIT_BACKEND=pg` so counters move to the shared PostgreSQL-backed store from ADR 0037. A Redis backend remains a future option if traffic later outgrows PostgreSQL.
4. **ProviderRateLimiter** — Replace in-memory tracking with Redis token bucket
5. **File storage** — Switch to object storage (S3) or ensure shared filesystem (NFS/EFS) across all processes

### Priority 2: Degrades experience (stale data, redundant work)

6. **ViewResolver** — Replace module-level Maps with Redis cache (or accept slightly stale views behind a load balancer)
7. **FeatureFlagService** — Replace module-level cache with Redis or accept 1-min staleness
8. **CacheManager** — Already supports a filesystem backend; could add a Redis backend

### Priority 3: Edge cases

9. **ProgressTrackingService** — Add optimistic locking (version field) or use `jsonb_set()` SQL for atomic updates

## Consequences

- Deployment is limited to a single process (or single container with one Node.js worker)
- Vertical scaling (bigger machine) works; horizontal scaling (multiple processes) does not
- `RateLimitService` is now an exception: it can use a shared PostgreSQL backend when `RATE_LIMIT_BACKEND=pg`, but the overall application still has other single-process assumptions listed above
- This is acceptable for the current scale and simplifies the codebase significantly
- The scaling path is well-understood and can be implemented incrementally when needed
