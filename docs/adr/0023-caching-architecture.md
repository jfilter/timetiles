# ADR 0023: Caching Architecture

## Status

Accepted

## Context

TimeTiles performs several repetitive lookups on every request: resolving which site and view to render, checking feature flags, and geocoding addresses during imports. Without caching, each of these would hit the database (or an external API) on every call. The caching strategy must balance freshness, memory safety, and operational simplicity within the single-process architecture established in ADR 0001.

## Decision

TimeTiles uses a multi-layer caching strategy with four distinct tiers. Each tier serves a different access pattern. There is no shared cache infrastructure (no Redis); all caches are process-local or filesystem-local.

### Layer 1: TTL-Based Singletons (Process Memory)

Small, domain-specific caches that store a single value or a small Map with time-based expiration. These are the simplest caches in the system.

| Component                      | TTL   | What Is Cached                             | Invalidation                                      |
| ------------------------------ | ----- | ------------------------------------------ | ------------------------------------------------- |
| `FeatureFlagService`           | 1 min | All feature flags (single object)          | TTL expiry; `resetFeatureFlagService()` for tests |
| `createCachedResolver` (sites) | 5 min | Site documents keyed by domain             | TTL clears entire Map; `clearSiteCache()`         |
| `createCachedResolver` (views) | 5 min | View documents keyed by slug + site scope  | TTL clears entire Map; `clearViewCache()`         |
| `getEmailBranding`             | 5 min | Site name and logo URL for email templates | TTL expiry                                        |

**Pattern:** Module-level variable holds the cached value and a timestamp. On access, if `now - timestamp > TTL`, the cache is discarded and re-fetched from the database.

**`createCachedResolver` detail:** A generic factory (`lib/services/resolution/create-cached-resolver.ts`) that produces closure-scoped `Map` caches for any Payload collection. It supports key-based lookup (e.g., domain, slug) and default-document lookup (`isDefault: true`), with optional scoping for multi-tenant resolution (views are scoped to a site). The entire cache is cleared when the TTL expires rather than evicting individual entries.

### Layer 2: In-Memory LRU Cache (Process Memory)

A general-purpose cache backed by the `lru-cache` library, exposed through the `Cache` class and `MemoryCacheStorage` backend.

| Setting         | Default                                |
| --------------- | -------------------------------------- |
| Max entries     | 1,000                                  |
| Max size        | 100 MB                                 |
| Eviction policy | Least Recently Used                    |
| Per-entry TTL   | Configurable via `CacheSetOptions.ttl` |

The `MemoryCacheStorage` wraps `LRUCache` from the `lru-cache` npm package. It tracks hit/miss/eviction statistics, calculates entry sizes via JSON serialization length, and supports tag-based invalidation. The `Cache` class adds key prefixing, namespacing, a `getOrSet` cache-aside helper, and error handling that logs failures and returns graceful fallbacks.

The `CacheManager` singleton tracks all named `Cache` instances for coordinated operations (cleanup, stats, destroy).

### Layer 3: Filesystem Cache (Disk)

A persistent cache that survives process restarts, implemented by `FileSystemCacheStorage`.

| Setting         | Default                                            |
| --------------- | -------------------------------------------------- |
| Cache directory | `.cache/general` (relative to `process.cwd()`)     |
| Max size        | 500 MB                                             |
| Default TTL     | 1 hour                                             |
| Eviction policy | Expired entries first, then LRU to 80% of max size |

**Structure:** Cache files are stored in SHA-256-hashed subdirectories (first two hex characters as the subdirectory name) for filesystem performance with large entry counts. An `index.json` file maintains a Map of all entries with their file paths, expiration timestamps, and sizes, enabling fast lookups without scanning the filesystem.

**Primary consumer:** The `UrlFetchCache` uses filesystem storage to cache HTTP responses from scheduled import URLs. It supports:

- **ETag and conditional requests** (If-None-Match, If-Modified-Since) for efficient revalidation
- **Cache-Control header parsing** (max-age, no-store, no-cache, Expires)
- **Content hashing** (SHA-256) for change detection
- **Per-user cache keys** to isolate user-specific URL responses
- **Stale-on-error** fallback when revalidation fails
- **URL normalization** (lowercase hostname, sorted query params, removed default ports) for consistent cache keys
- **Configurable limits** via environment variables: `URL_FETCH_CACHE_DIR`, `URL_FETCH_CACHE_MAX_SIZE` (default 100 MB), `URL_FETCH_CACHE_TTL` (default 1 hour), `URL_FETCH_CACHE_MAX_TTL` (default 30 days)

### Layer 4: Database-Backed Cache (PostgreSQL)

The `location-cache` Payload collection stores geocoding results in PostgreSQL.

| Setting        | Default                                                 |
| -------------- | ------------------------------------------------------- |
| TTL            | 30 days (configurable via Settings global as `ttlDays`) |
| Indexed fields | `originalAddress` (unique), `normalizedAddress`         |
| Usage tracking | `hitCount`, `lastUsed` timestamps                       |

**Address normalization:** Before lookup, addresses are lowercased, trimmed, whitespace-collapsed, and special characters stripped so that "123 Main St", " 123 MAIN ST ", and "123 main st" all resolve to the same cache key.

**Batch operations:** The `CacheManager` (in `lib/services/geocoding/cache-manager.ts`, distinct from the general `CacheManager`) supports batch lookups via a single `WHERE normalizedAddress IN (...)` query, batch hit-count updates via raw SQL, and fire-and-forget deletion of expired entries found during batch reads.

**Cleanup:** Expired entries are removed both reactively (on cache miss during lookup) and proactively (via the `cleanupCache()` method called from background jobs).

### Layer 5: Client-Side Cache (Browser)

React Query manages all client-side server state caching through standardized presets in `lib/hooks/query-presets.ts`:

| Preset      | Stale Time | GC Time | Use Case                            |
| ----------- | ---------- | ------- | ----------------------------------- |
| `standard`  | 1 min      | 5 min   | General data (events, datasets)     |
| `expensive` | 2 min      | 10 min  | Histograms, aggregations            |
| `stable`    | 5 min      | 30 min  | Metadata that rarely changes        |
| `frequent`  | 30 sec     | 2 min   | Active monitoring (import progress) |

This layer is documented in ADR 0005 (Frontend Architecture) and operates independently of server-side caches.

### Cache Cleanup

A scheduled background job (`cache-cleanup`, every 6 hours) runs cleanup across all registered cache instances:

1. Cleans the `UrlFetchCache` (filesystem)
2. Iterates all `CacheManager`-tracked instances and calls `cleanup()` on each
3. Logs total entries cleaned and per-cache statistics

### Why No Redis

ADR 0001 establishes that TimeTiles runs as a single Node.js process. All caches are process-local (in-memory) or node-local (filesystem, database). This eliminates:

- An additional infrastructure dependency to deploy and monitor
- Network round-trips for cache reads (in-memory access is sub-microsecond)
- Cache serialization overhead for complex objects
- Operational complexity of Redis persistence, eviction policies, and memory tuning

The scaling path documented in ADR 0001 identifies which caches would need to move to Redis if horizontal scaling becomes necessary. The `CacheStorage` interface already abstracts the storage backend, so adding a Redis implementation would not require changes to calling code.

### Cache Invalidation Strategies

| Strategy                   | Where Used                                                                                      |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| **TTL expiry**             | All caches (primary strategy)                                                                   |
| **LRU eviction**           | In-memory cache (max entries/size), filesystem cache (80% target)                               |
| **Explicit clear**         | `clearSiteCache()`, `clearViewCache()`, `resetFeatureFlagService()` for admin changes and tests |
| **Tag-based invalidation** | `Cache.invalidateByTags()` iterates entries and deletes matching tags                           |
| **Reactive deletion**      | Location cache deletes expired entries on cache miss                                            |
| **Scheduled cleanup**      | `cache-cleanup` job every 6 hours                                                               |
| **Per-user invalidation**  | `UrlFetchCache.invalidateForUser()` removes all entries for a user ID                           |

## Consequences

- Each cache tier has clear size bounds and TTL limits, preventing unbounded memory growth
- No external infrastructure beyond PostgreSQL is required for caching
- Cache staleness is bounded and predictable (1 min for flags, 5 min for site/view resolution, configurable for geocoding)
- The generic `Cache` + `CacheStorage` interface allows adding new storage backends without changing consumers
- Filesystem cache survives process restarts, which is important for URL fetch caching during scheduled imports
- Database-backed location cache persists across deployments and can be shared if the architecture evolves to multi-process
- The trade-off is that horizontal scaling requires migrating in-memory caches to a shared store (see ADR 0001 scaling path)
