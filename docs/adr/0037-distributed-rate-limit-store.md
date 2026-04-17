# ADR 0037: Distributed Rate Limit Store

## Status

Proposed

## Context

`RateLimitService` currently stores counters in a process-local `Map<string, RateLimitEntry>`. That is fast and simple for the single-process deployment model described in ADR 0001, but it becomes incorrect as soon as requests can land on more than one Node.js worker or container.

This is not just a performance detail. Security-sensitive routes such as registration, password change, account deletion, uploads, webhooks, and data exports depend on rate limits for abuse prevention. In a multi-worker deployment, process-local counters let an attacker multiply the effective limit by round-robining requests across workers.

The review flagged three possible directions:

1. Keep the in-memory implementation and document the single-process assumption
2. Move counters into PostgreSQL
3. Move counters into Redis (or another shared in-memory store)

The decision needs to preserve local-development simplicity while providing a correct path for horizontally scaled production deployments.

## Decision

TimeTiles will standardize on a **pluggable rate-limit storage layer** with two concrete backends:

- **Memory backend** for local development, tests, and explicitly single-process deployments
- **Redis backend** for any production deployment that can serve requests from more than one process or container

### Storage contract

`RateLimitService` should depend on a small storage interface rather than directly on a `Map`. The storage contract must support:

- `checkAndIncrement(key, limit, windowMs)` for atomic increment + expiry
- `peek(key)` for header generation without incrementing
- `reset(key)` for tests and admin tooling
- `cleanup()` only where the backend requires it

The service API exposed to routes should stay the same. Only the persistence mechanism changes.

### Why Redis

Redis is the shared-store choice for short-window rate limiting because it matches the access pattern:

- atomic increment primitives
- native TTL expiry
- low-latency hot-key reads/writes
- no per-request SQL row updates
- no background cleanup job required for normal expiry

The Redis backend should use one key per window, for example:

`rl:{scope}:{identifier}:{window-name}`

Each key stores the count for its current window and uses the window TTL for expiration. Increment + first-write expiry should happen atomically via Lua or an equivalent Redis atomic pattern.

### Why not PostgreSQL

PostgreSQL remains the right store for quotas and durable accounting, but it is the wrong default for burst-rate counters:

- every request becomes a write
- hot keys cause unnecessary row churn and contention
- cleanup for expired windows becomes another maintenance concern
- short-window abuse prevention should not compete with primary OLTP traffic

Quota enforcement already covers the durable, lower-frequency fairness problem. Rate limiting is the short-lived abuse-prevention layer and should use a store optimized for ephemeral counters.

### Deployment rule

Production deployments that run more than one app process must use the Redis backend before horizontal scaling is enabled. Keeping the in-memory backend in a multi-worker production environment is not an acceptable steady state.

### Migration path

Implementation should proceed in stages:

1. Introduce the storage interface with the current in-memory logic as `MemoryRateLimitStore`
2. Add `RedisRateLimitStore`
3. Select the backend from config
4. Update tests so storage-specific behavior is covered independently of route tests
5. Document the operational requirement in deployment docs and ADR 0001/0002 follow-ups

## Consequences

### Positive

- Rate limits remain correct across workers and containers
- The route-level API does not need to change
- Local development and most tests stay simple with the memory backend
- Redis aligns with the scaling path already documented in ADR 0001

### Negative

- Horizontal scaling now carries a Redis dependency for correct abuse prevention
- The rate-limit subsystem becomes slightly more complex because it must support multiple backends
- Local and production behavior diverge at the storage layer, so backend-specific tests become important

### Neutral

- Quota enforcement remains PostgreSQL-backed and separate from rate limiting
- Single-process deployments can continue using the memory backend without behavioral change

## Alternatives Considered

### Keep the in-memory `Map`

Rejected. It is acceptable only under the strict single-process assumption from ADR 0001, and the review item exists because that assumption is too easy to violate operationally.

### Use PostgreSQL as the shared counter store

Rejected. PostgreSQL is durable and already present, but it is a poor fit for bursty, TTL-based counters compared with Redis.

### Push all rate limiting to CDN or edge infrastructure

Rejected. TimeTiles needs route-specific, user-aware, and token-aware limits that depend on application identity, not just IP-level edge throttling.

## Related

- ADR 0001: Single-Process Architecture
- ADR 0002: Security Model
- ADR 0012: Scheduled Imports and Webhooks
- ADR 0026: Quota System
