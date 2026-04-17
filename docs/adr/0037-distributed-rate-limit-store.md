# ADR 0037: Distributed Rate Limit Store

## Status

Accepted and implemented.

`RateLimitService` now supports a pluggable storage backend. The default backend remains in-memory for local development, tests, and explicitly single-process deployments. A PostgreSQL-backed shared store is available for horizontally scaled web deployments.

## Context

`RateLimitService` currently stores counters in a process-local `Map<string, RateLimitEntry>`. That is fast and simple for the single-process deployment model described in ADR 0001, but it becomes incorrect as soon as requests can land on more than one Node.js worker or container.

This is not just a performance detail. Security-sensitive routes such as registration, password change, account deletion, uploads, webhooks, and data exports depend on rate limits for abuse prevention. In a multi-worker deployment, process-local counters let an attacker multiply the effective limit by round-robining requests across workers.

The review flagged three possible directions:

1. Keep the in-memory implementation and document the single-process assumption
2. Move counters into PostgreSQL
3. Move counters into Redis (or another shared in-memory store)

The decision needs to preserve local-development simplicity while providing a correct path for horizontally scaled production deployments, while also matching the team's preference for minimal additional infrastructure.

## Decision

TimeTiles standardizes on a **pluggable rate-limit storage layer** with two concrete states today:

- **Memory backend** for local development, tests, and explicitly single-process deployments
- **PostgreSQL backend** for any deployment that can serve overlapping traffic from more than one web process or container

### Storage contract

`RateLimitService` should depend on a small storage interface rather than directly on a `Map`. The storage contract must support:

- `checkAndIncrement(key, limit, windowMs)` for atomic increment + expiry
- `peek(key)` for header generation without incrementing
- `reset(key)` for tests and admin tooling
- `block(key, durationMs)` for explicit manual blocks
- `cleanup()` only where the backend requires it

The service API exposed to routes should stay the same. Only the persistence mechanism changes.

### Why PostgreSQL first

PostgreSQL is already present in every deployment and keeps the first shared-store step operationally simple:

- no new infrastructure dependency
- no new operational failure mode beyond the existing database dependency
- straightforward integration with the existing Payload/Drizzle database access
- good enough performance for current low-to-moderate shared traffic

The PostgreSQL backend uses one opaque key per rate-limit window in `payload.rate_limit_counters`. Each check performs a single atomic UPSERT that:

- inserts a new counter for first use
- resets the counter when the previous window has expired
- increments the counter while the window is active
- preserves blocked state without incrementing further

The table is intentionally `UNLOGGED` because rate-limit counters are ephemeral. Correctness depends on sharing counters across workers, not on WAL durability after a crash.

### Why keep memory as the default

For local development and single-process deployments, the in-memory backend remains the simplest and fastest option:

- zero database writes
- no cleanup job outside the process-local interval
- no behavioral change for local workflows or most tests

This avoids pushing production-oriented shared storage onto environments that do not need it.

### Redis follow-up

Redis is explicitly deferred, not rejected. If shared traffic grows to the point where PostgreSQL write amplification becomes a material operational cost, a future `RedisRateLimitStore` can be added behind the same storage interface without changing route-level APIs.

### Deployment rule

Production deployments that run more than one web process or container must set `RATE_LIMIT_BACKEND=pg` before horizontal scaling is enabled. Keeping the in-memory backend in a multi-worker production environment is not an acceptable steady state.

### Migration path

Implementation proceeds as:

1. Extract the current `Map` logic into `MemoryRateLimitStore`
2. Add `PgRateLimitStore`
3. Select the backend from `RATE_LIMIT_BACKEND`
4. Cover shared behavior with backend-agnostic contract tests plus PostgreSQL-specific concurrency tests
5. Run PostgreSQL cleanup on the maintenance queue to purge expired rows
6. Document the operational requirement in deployment docs

## Consequences

### Positive

- Rate limits remain correct across workers and containers
- The route-level API does not need to change
- Local development and most tests stay simple with the memory backend
- The first shared-store rollout does not require introducing Redis or another new service

### Negative

- Horizontal scaling now makes PostgreSQL part of the short-window abuse-prevention hot path
- The rate-limit subsystem becomes slightly more complex because it must support multiple backends
- Expired shared counters require a cleanup job for table hygiene
- Local and production behavior diverge at the storage layer, so backend-specific tests become important

### Neutral

- Quota enforcement remains PostgreSQL-backed and separate from rate limiting
- Single-process deployments can continue using the memory backend without behavioral change

## Alternatives Considered

### Keep the in-memory `Map`

Rejected. It is acceptable only under the strict single-process assumption from ADR 0001, and the review item exists because that assumption is too easy to violate operationally.

### Use PostgreSQL as the shared counter store

Accepted for the first shared-store implementation. It is not the ideal long-term store for every traffic profile, but it is the best trade-off for current deployment simplicity and the team's minimal-infrastructure preference.

### Use Redis as the shared counter store now

Deferred. Redis remains a credible future backend, but introducing it now would add infrastructure and operational complexity before PostgreSQL has proved insufficient for the actual workload.

### Push all rate limiting to CDN or edge infrastructure

Rejected. TimeTiles needs route-specific, user-aware, and token-aware limits that depend on application identity, not just IP-level edge throttling.

## Related

- ADR 0001: Single-Process Architecture
- ADR 0002: Security Model
- ADR 0012: Scheduled Imports and Webhooks
- ADR 0026: Quota System
