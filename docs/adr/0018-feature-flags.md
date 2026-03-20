# ADR 0018: Feature Flags System

## Status

Accepted

## Context

TimeTiles needs a way for administrators to enable or disable major features at runtime without redeploying. Examples include disabling public registration during an incident, turning off scheduled imports for maintenance, or gating experimental features like scrapers behind an opt-in toggle. The mechanism must work server-side (API routes, background jobs, Payload hooks) and client-side (React components in both the frontend and the Payload admin panel).

## Decision

### Storage: Settings Global

Feature flags are stored as a `featureFlags` checkbox group inside the Payload CMS `Settings` global (`lib/globals/settings.ts`). Each flag is a named boolean field with a default value. Admins toggle flags through the standard Payload dashboard at `/dashboard/globals/settings`.

| Flag                          | Default | Purpose                                                     |
| ----------------------------- | ------- | ----------------------------------------------------------- |
| `allowPrivateImports`         | `true`  | Users can create private imports visible only to themselves |
| `enableScheduledImports`      | `true`  | Users can create automated URL-based import schedules       |
| `enableRegistration`          | `true`  | New users can self-register accounts                        |
| `enableEventCreation`         | `true`  | New events can be created via imports or API                |
| `enableDatasetCreation`       | `true`  | Users can create new datasets                               |
| `enableImportCreation`        | `true`  | Users can create new import jobs                            |
| `enableScheduledJobExecution` | `true`  | Scheduled import jobs execute automatically                 |
| `enableUrlFetchCaching`       | `true`  | URL fetches for scheduled imports are cached                |
| `enableScrapers`              | `false` | Scraper repos and scraper execution (opt-in)                |

Adding a new flag requires adding a checkbox field to `Settings`, a key to the `FeatureFlags` interface, and a default in both `DEFAULT_FLAGS` and `DISABLED_FLAGS`.

### Service Layer: FeatureFlagService

`lib/services/feature-flag-service.ts` is a singleton class that reads flags from the Settings global and caches them in memory.

**Singleton pattern.** The service uses `getFeatureFlagService(payload)` which creates exactly one instance per process. This is intentional: the in-memory cache is process-level state, so a fresh instance per request would defeat caching. A `resetFeatureFlagService()` function is exported for test cleanup.

**Caching.** Flags are cached for 60 seconds (`CACHE_TTL_MS = 60_000`). Within that window, `getAll()` returns the cached value without querying the database. After the TTL expires, the next call fetches fresh values from the Settings global. There is no active cache invalidation; changes propagate within one TTL cycle.

**Defaults.** Two default objects exist for different failure scenarios:

- `DEFAULT_FLAGS` -- used when the Settings global exists but a specific flag field is missing (e.g., after adding a new flag before the admin sets it). Most flags default to `true`; `enableScrapers` defaults to `false`.
- `DISABLED_FLAGS` -- all flags set to `false`. Returned when the Settings global cannot be read at all (database down, connection error).

### Fail-Closed Policy

Every layer of the system defaults to **disabled** when flag state is uncertain:

| Scenario                            | Behavior                                      |
| ----------------------------------- | --------------------------------------------- |
| Database unreachable (server)       | `DISABLED_FLAGS` returned -- all features off |
| API fetch fails (frontend)          | `useFeatureEnabled` returns `false`           |
| API fetch fails (admin panel)       | `useAdminFeatureFlag` sets `false`            |
| Flag loading in progress (frontend) | `useFeatureEnabled` returns `false`           |

This fail-closed policy means a database outage temporarily disables gated features rather than accidentally enabling something that should be off.

### Server-Side Enforcement Points

Flags are checked in four contexts on the server, each using `isFeatureEnabled(payload, flagName)`:

**1. Payload collection access control** -- controls whether create operations are allowed.

| Collection       | Flag                     | Effect when disabled                                    |
| ---------------- | ------------------------ | ------------------------------------------------------- |
| Events           | `enableEventCreation`    | `beforeChange` hook returns `false`, blocking creation  |
| Datasets         | `enableDatasetCreation`  | `create` access function returns `false`                |
| ImportJobs       | `enableImportCreation`   | `create` access function returns `false`                |
| ScheduledImports | `enableScheduledImports` | `create` access function returns `false`                |
| ScraperRepos     | `enableScrapers`         | `create` access function returns `false`                |
| Catalogs         | `allowPrivateImports`    | Controls whether private visibility option is available |
| Datasets (hooks) | `allowPrivateImports`    | Controls private visibility in `beforeChange` hook      |

**2. API route handlers** -- use `requireFeatureEnabled()` from `lib/api/auth-helpers.ts`, which throws `ForbiddenError` if the flag is off. A convenience wrapper `requireScrapersEnabled()` exists for the scrapers flag.

| Route                                   | Flag                                            |
| --------------------------------------- | ----------------------------------------------- |
| `POST /api/auth/register`               | `enableRegistration`                            |
| Scraper API routes (run, sync, trigger) | `enableScrapers` (via `requireScrapersEnabled`) |

**3. Background job handlers** -- check flags before executing. Jobs use dynamic imports (`await import(...)`) to avoid circular dependencies.

| Job                          | Flag                          | Effect when disabled             |
| ---------------------------- | ----------------------------- | -------------------------------- |
| `schedule-manager-job`       | `enableScheduledJobExecution` | Skips scheduled import execution |
| `schedule-manager-job`       | `enableScrapers`              | Skips scraper scheduling         |
| `scraper-execution-job`      | `enableScrapers`              | Aborts scraper run               |
| `cleanup-stuck-scrapers-job` | `enableScrapers`              | Skips cleanup                    |
| `url-fetch-job`              | `enableUrlFetchCaching`       | Disables fetch result caching    |

**4. Server components** -- check flags at render time for page-level gating.

| Page                | Flag             | Effect when disabled              |
| ------------------- | ---------------- | --------------------------------- |
| `/account/scrapers` | `enableScrapers` | Redirects away from scrapers page |

### Client-Side Exposure

**API endpoint.** `GET /api/feature-flags` returns all flags as a JSON object. It requires no authentication (`auth: "none"`) so the frontend can read flags before login. The response includes `Cache-Control: public, s-maxage=60, stale-while-revalidate=300` to allow CDN and browser caching.

**Frontend hook: `useFeatureFlags`** (`lib/hooks/use-feature-flags.ts`). A React Query hook using the `standard` preset (1 minute stale time, 5 minute garbage collection). Returns the full `FeatureFlags` object. A companion `useFeatureEnabled(flagName)` hook returns `{ isEnabled, isLoading, error }` for checking a single flag. Both fail closed: `isEnabled` is `false` while loading or on error.

**Admin panel hook: `useAdminFeatureFlag`** (`lib/hooks/use-admin-feature-flag.ts`). The Payload admin panel does not have a `QueryClientProvider`, so this hook uses plain `useState`/`useEffect` instead of React Query. It fetches from the same `/api/feature-flags` endpoint and returns `{ isEnabled }` where `null` means loading. Used by `FeatureDisabledBanner` to show warnings in collection list views when creation is disabled.

### Audit Trail

The Settings global `afterChange` hook detects feature flag changes by comparing `previousDoc.featureFlags` with `doc.featureFlags`. When any flag changes, it logs a `system.feature_flag_changed` audit entry with the changed flags, old values, and new values. This creates a complete history of who changed which flags and when.

### Caching Summary

The flag value passes through up to three cache layers:

| Layer                                        | TTL                                           | Location              |
| -------------------------------------------- | --------------------------------------------- | --------------------- |
| `FeatureFlagService` in-memory cache         | 60 seconds                                    | Server process memory |
| HTTP `Cache-Control` on `/api/feature-flags` | 60s `s-maxage`, 300s `stale-while-revalidate` | CDN / reverse proxy   |
| React Query cache (`useFeatureFlags`)        | 60 seconds stale time                         | Browser memory        |

In the worst case, a flag change takes up to ~2 minutes to propagate to all frontend clients (server cache TTL + React Query stale time). Server-side enforcement sees changes within 60 seconds.

## Consequences

- Admins can toggle features without deployments, which enables quick incident response
- The fail-closed policy adds safety but means a database outage temporarily disables more features than necessary
- No per-user or percentage-based rollout -- flags are global on/off switches, which is sufficient for the current scale
- The 60-second cache TTL is a deliberate trade-off: it reduces database load but means flag changes are not instantaneous
- Adding a new flag touches three files (Settings global fields, `FeatureFlags` interface, default objects) which keeps the system simple but requires manual coordination
- The audit trail provides accountability for flag changes, which is important for compliance and debugging
