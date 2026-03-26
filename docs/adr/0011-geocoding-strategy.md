# ADR 0011: Geocoding Strategy

## Status

Accepted

## Context

TimeTiles geocodes event locations during file imports so events can be displayed on maps. Geocoding depends on external APIs that have rate limits, cost money, and can fail. The system needs to support multiple providers, gracefully handle failures, minimize API calls through caching, and avoid blocking imports when individual addresses fail to geocode.

## Decision

### Multi-Provider Architecture

The geocoding system uses a four-component facade pattern:

| Component             | File                                              | Responsibility                                                                       |
| --------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `GeocodingService`    | `lib/services/geocoding/geocoding-service.ts`     | Public API facade; lazy initialization; loads settings from the `settings` global    |
| `ProviderManager`     | `lib/services/geocoding/provider-manager.ts`      | Loads provider configs from DB, creates `node-geocoder` instances, sorts by priority |
| `GeocodingOperations` | `lib/services/geocoding/geocoding-operations.ts`  | Orchestrates cache lookup, provider fallback, batch processing, confidence scoring   |
| `CacheManager`        | `lib/services/geocoding/cache-manager.ts`         | Reads/writes the `location-cache` collection; normalizes addresses; enforces TTL     |
| `ProviderRateLimiter` | `lib/services/geocoding/provider-rate-limiter.ts` | In-memory token bucket per provider; singleton instance                              |

A simplified entry point (`lib/services/geocoding.ts`) exposes `createGeocodingService(payload)` which returns a `GeocodingService` instance for use by the import pipeline.

### Supported Providers

Providers are configured through the Payload admin panel (`geocoding-providers` collection, defined in `lib/collections/geocoding-providers.ts`). Five types are supported:

| Provider        | Implementation                | Default Priority | Default Rate Limit                       | API Key Required | Default Enabled |
| --------------- | ----------------------------- | ---------------- | ---------------------------------------- | ---------------- | --------------- |
| Photon          | Custom wrapper                | 1-2              | 30 req/s (VersaTiles), 10 req/s (Komoot) | No               | Yes             |
| Nominatim (OSM) | `node-geocoder` openstreetmap | 3                | 1 req/s                                  | No               | Yes (fallback)  |
| LocationIQ      | `node-geocoder` locationiq    | —                | 2 req/s                                  | Yes              | No              |
| OpenCage        | `node-geocoder` opencage      | —                | 10 req/s                                 | Yes              | No              |
| Google Maps     | `node-geocoder` google        | —                | 50 req/s                                 | Yes              | No              |

Each provider document stores: `name`, `type`, `enabled`, `priority`, `rateLimit`, `group` (for batch distribution), provider-specific config (API keys, region bias, bounds, location bias), `tags` for filtering, and read-only usage `statistics`.

Photon providers support additional config: location bias (lat/lon/zoom), bounding box filter, OSM tag filter, and layer filter. Two Photon instances (VersaTiles and Komoot) are enabled by default with `group: "photon"` — the batch geocoder distributes work across them proportionally to their `rateLimit`.

When no providers are configured in the database, `ProviderManager.buildDefaultProviderConfigs()` creates a Nominatim provider as the zero-configuration fallback.

> **Fair use**: The free Photon (VersaTiles, Komoot) and Nominatim providers are community services. There are no published rate limits for VersaTiles or Komoot, but heavy abuse may result in throttling. The default rate limits are based on empirical testing (March 2026). For high-volume production use, self-host a Photon instance or use a paid provider.

### Provider Selection and Fallback

Settings are loaded from the `settings` global (`lib/globals/settings.ts`, `geocoding` group) with these defaults:

| Setting                          | Default      | Effect                                                         |
| -------------------------------- | ------------ | -------------------------------------------------------------- |
| `enabled`                        | `true`       | Master switch for geocoding                                    |
| `fallbackEnabled`                | `true`       | On failure, cascade to next provider by priority               |
| `providerSelection.strategy`     | `"priority"` | Select providers by numeric priority (lower = higher)          |
| `providerSelection.requiredTags` | `[]`         | Filter providers by tags (only when strategy is `"tag-based"`) |
| `caching.enabled`                | `true`       | Use the `location-cache` collection                            |
| `caching.ttlDays`                | `30`         | Days before a cached result expires                            |

The geocoding flow for a single address (`GeocodingOperations.geocode()`):

1. Check cache (normalized address lookup in `location-cache` collection)
2. If cache miss, iterate enabled providers sorted by `priority` ascending
3. For each provider: wait for a rate-limit slot, call `geocoder.geocode()` with a 10-second timeout
4. Validate the result (lat/lng within bounds, confidence >= 0.5)
5. Cache the result and return
6. If the provider fails and `fallbackEnabled` is true, try the next provider
7. If all providers fail, throw `GeocodingError("ALL_PROVIDERS_FAILED")`

### Rate Limiting

`ProviderRateLimiter` (`lib/services/geocoding/provider-rate-limiter.ts`) is a process-level singleton that serializes concurrent requests via promise chaining (avoiding TOCTOU race conditions) and enforces per-provider request intervals.

The rate limiter includes adaptive backoff: when a provider returns 429, 503, or 404-as-throttle (Photon-specific), it applies exponential backoff (2s → 4s → 8s → max 30s) via `reportThrottle()`. On success, `reportSuccess()` resets the backoff. `isAvailable()` checks whether a provider is currently in backoff.

All HTTP responses pass through `createStatusCheckingFetch()` (`provider-manager.ts`) which intercepts 429/503 before `node-geocoder`'s fetch adapter can silently parse them as valid JSON.

This is **in-memory state** tied to the single-process architecture (see ADR 0001). Running multiple processes would allow each to independently hit a provider at its configured rate.

### Caching

The `location-cache` collection (`lib/collections/location-cache.ts`) is a database-backed cache:

- **Normalization**: Before lookup, `CacheManager.normalizeAddress()` lowercases, collapses whitespace, strips special characters, and removes trailing commas. This improves hit rates for minor formatting differences.
- **TTL**: Entries older than `caching.ttlDays` (default 30) are deleted on read and during periodic `cleanupCache()` runs.
- **Usage tracking**: Each cache hit increments `hitCount` and updates `lastUsed`.
- **Access control**: Created and updated only by the system (access: `create: () => false`, `update: () => false`). Editors and admins can delete entries.

### Integration with the Import Pipeline

The `geocode-batch` job handler (`lib/jobs/handlers/geocode-batch-job.ts`) connects geocoding to the import pipeline (see ADR 0004):

1. **Create service**: Calls `createGeocodingService(payload)` to obtain a `GeocodingService` instance scoped to this job invocation.
2. **Detect location field**: Uses `getGeocodingCandidate(job)` from field mappings. If no location field exists, the stage is skipped and the pipeline advances to `CREATE_EVENTS`.
3. **Read rows**: Reads all rows from the import file.
4. **Extract unique locations**: `extractUniqueLocations()` builds a `Set<string>` of distinct, trimmed location values. This is the primary optimization -- an import with 10,000 rows but 200 unique addresses only makes (at most) 200 API calls.
5. **Geocode sequentially**: Each unique location is geocoded via `geocodingService.geocode()`. Progress is reported every 10 locations.
6. **Store results**: Geocoded coordinates are saved to the import job's `geocodingResults` field as a map from location string to `{ coordinates, confidence, formattedAddress }`.
7. **Failure handling**:
   - Individual failures are logged but do not block the import. Events for those locations are created without coordinates.
   - If **all** locations fail, the job transitions to `FAILED` with a detailed error message listing the first 10 failures.

### Confidence Scoring

`GeocodingOperations.calculateConfidence()` assigns a 0.0--1.0 confidence score per provider:

| Provider  | Logic                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------- |
| Google    | Maps `extra.confidence` string: `exact_match` = 0.95, `high` = 0.85, `medium` = 0.7, default = 0.6 |
| OpenCage  | Uses `extra.confidence` number directly (default 0.7)                                              |
| Nominatim | Base 0.6; +0.2 if street number and name present; +0.1 if city and state present                   |

Results with confidence below 0.5 are rejected by `isResultAcceptable()`.

## Consequences

- Nominatim provides zero-configuration geocoding out of the box. No API keys are needed for basic usage.
- The 1 req/s Nominatim rate limit is the primary bottleneck for large imports. An import with 500 unique locations takes ~8 minutes for geocoding alone. Adding a Google or OpenCage provider with higher rate limits significantly reduces this.
- The in-memory rate limiter is simple but cannot be shared across processes (see ADR 0001). Horizontal scaling requires migrating to Redis-based rate limiting.
- Database-backed caching (rather than in-memory) means cache state survives process restarts and is shared if multiple processes are ever introduced.
- The unique-location extraction step means geocoding cost scales with the number of distinct addresses, not the number of rows. Repeated imports of similar data benefit heavily from the cache.
- Failed geocodes produce events without coordinates. These events are invisible on the map but still accessible via non-spatial queries. This is a deliberate trade-off to avoid blocking entire imports due to a few bad addresses.
