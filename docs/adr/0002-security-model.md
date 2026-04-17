# ADR 0002: Security Model

## Status

Accepted

## Context

TimeTiles is a multi-tenant platform where users import data, trigger geocoding against external APIs, and consume shared server resources. The security model must handle authentication, authorization, abuse prevention, and resource fairness without adding operational complexity (see ADR 0001: single-process architecture).

## Decision

TimeTiles uses a **layered security model** with cookie-based authentication, two orthogonal authorization axes (roles and trust levels), field-level access control, and a two-tier rate limiting strategy.

## Authentication

Payload CMS provides built-in cookie-based authentication. JWTs are stored in HTTP-only cookies, never exposed as bearer tokens in responses.

| Feature            | Behavior                                               | Reference                               |
| ------------------ | ------------------------------------------------------ | --------------------------------------- |
| Login              | Cookie-based session via Payload auth                  | `lib/collections/users.ts` `auth` block |
| Email verification | Required; tokens do not expire (Payload v3 limitation) | `auth.verify` config                    |
| Password reset     | Email link; 1-hour token expiry (Payload default)      | `auth.forgotPassword` config            |
| Self-registration  | Open; constrained by `beforeChange` hook (see below)   | `access.create`                         |

## Authorization: Two Orthogonal Axes

### Roles (what you can do)

Three roles control access to collections and admin operations:

| Role       | Capabilities                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| **admin**  | Full CRUD on all collections, manage users, update settings and geocoding providers, change trust levels |
| **editor** | Create and manage own content (datasets, imports, events)                                                |
| **user**   | Read own profile, create content within quota limits                                                     |

### Trust Levels (how much you can do)

Six numeric trust levels control resource quotas and rate limits. They are independent of roles: a `user` with `POWER_USER` trust gets generous quotas but no admin access.

| Level | Name       | File uploads/day | Events/import | Total events | Schedules | API burst/s |
| ----- | ---------- | ---------------- | ------------- | ------------ | --------- | ----------- |
| 0     | Untrusted  | 1                | 100           | 100          | 0         | 1           |
| 1     | Basic      | 3                | 1,000         | 5,000        | 1         | 2           |
| 2     | Regular    | 10               | 10,000        | 50,000       | 5         | 5           |
| 3     | Trusted    | 50               | 50,000        | 500,000      | 20        | 10          |
| 4     | Power User | 200              | 200,000       | 2,000,000    | 100       | 20          |
| 5     | Unlimited  | -1               | -1            | -1           | -1        | 100         |

Full quota definitions: `lib/constants/quota-constants.ts` (`DEFAULT_QUOTAS`).

Trust levels are set by admins only (`trustLevel` field has admin-only update access). Admins can also set per-user overrides via the `customQuotas` JSON field, which takes precedence over trust-level defaults.

## Access Control Patterns

### Collection-level

Access functions return one of three shapes:

| Return                         | Meaning                           | Example                              |
| ------------------------------ | --------------------------------- | ------------------------------------ |
| `true`                         | Allow for all authenticated users | Admins reading any user              |
| `false`                        | Deny unconditionally              | Unauthenticated delete attempts      |
| `{ field: { equals: value } }` | Filter query to matching records  | Users reading only their own profile |

Example from `users.ts`: non-admin users reading their profile get `{ id: { equals: user.id } }`, which filters the query to their own record.

### Field-level

Sensitive fields restrict read or update access independently of collection-level rules:

| Field                    | Collection/Global   | Read              | Update                        |
| ------------------------ | ------------------- | ----------------- | ----------------------------- |
| `config.google.apiKey`   | geocoding-providers | admin only        | admin only (collection-level) |
| `config.opencage.apiKey` | geocoding-providers | admin only        | admin only (collection-level) |
| `newsletter.authHeader`  | settings            | admin only        | admin only                    |
| `trustLevel`             | users               | all authenticated | admin only                    |
| `quotas`                 | users               | all authenticated | admin only                    |
| `customQuotas`           | users               | admin only        | admin only                    |

References: `lib/globals/settings.ts`, `lib/collections/geocoding-providers.ts`, `lib/collections/users.ts`.

## Two-Tier Rate Limiting

Two services run together on every resource-consuming request. Rate limits fire first (fast short-window rejection), then quotas (accurate, database-backed tracking).

### Tier 1: RateLimitService (abuse prevention)

- **Storage**: Pluggable backend; `memory` by default, `pg` for shared counters across multiple web processes
- **Scope**: Per IP address (or IP + user ID for authenticated users)
- **Windows**: Sliding; burst (seconds), hourly, daily
- **Reset**: Automatic via process cleanup for `memory`, or row expiry plus maintenance cleanup for `pg`
- **Trust-aware**: Limits scale with user trust level
- **Deployment rule**: Multi-worker web deployments must set `RATE_LIMIT_BACKEND=pg`

File upload rate limits by trust level:

| Trust Level | Burst | Hourly  | Daily   |
| ----------- | ----- | ------- | ------- |
| Untrusted   | 1/min | 1/hr    | 1/day   |
| Basic       | 1/10s | 3/hr    | 3/day   |
| Regular     | 1/5s  | 5/hr    | 20/day  |
| Trusted     | 2/5s  | 20/hr   | 50/day  |
| Power User  | 5/5s  | 100/hr  | 200/day |
| Unlimited   | 10/s  | 1000/hr | --      |

Endpoint-specific configs (not trust-based) also exist for webhooks, password changes, data exports, and other operations. See `RATE_LIMITS` in `lib/services/rate-limit-service.ts`.

Reference: `lib/services/rate-limit-service.ts`, `lib/middleware/rate-limit.ts`, `docs/adr/0037-distributed-rate-limit-store.md`.

### Tier 2: QuotaService (resource fairness)

- **Storage**: PostgreSQL (`user-usage` collection), atomic SQL increments
- **Scope**: Per user ID
- **Windows**: Fixed; daily counters reset at midnight UTC, lifetime counters never reset
- **Persistence**: Survives restarts (unlike rate limits)
- **Atomic updates**: Uses `COALESCE(col, 0) + amount` SQL to prevent lost updates from concurrent requests

Eight quota types are tracked: active schedules, URL fetches/day, file uploads/day, events/import, total events, import jobs/day, file size, and catalogs/user.

Reference: `lib/services/quota-service.ts`, `lib/constants/quota-constants.ts`.

## Self-Registration Security

The `beforeChange` hook on the users collection prevents privilege escalation during self-registration:

| Field                | Forced Value | Why                                     |
| -------------------- | ------------ | --------------------------------------- |
| `role`               | `"user"`     | Prevents registering as admin or editor |
| `trustLevel`         | `BASIC` (1)  | Lowest non-zero quota tier              |
| `registrationSource` | `"self"`     | Audit trail                             |
| `isActive`           | `true`       | Ensures account works immediately       |

This enforcement only applies to REST API requests (`req.payloadAPI === "REST"`). Local API calls (`payload.create()`) used by seeding scripts and tests bypass the restriction so they can create admin users.

Reference: `lib/collections/users.ts`, `hooks.beforeChange`.

## CORS and CSRF

Configured in `lib/config/payload-config-factory.ts`:

| Environment | CORS                             | CSRF                  |
| ----------- | -------------------------------- | --------------------- |
| Production  | Single origin (`serverURL` only) | Enabled (same origin) |
| Development | Unrestricted (Payload defaults)  | Disabled              |
| Test        | Unrestricted (Payload defaults)  | Disabled              |

Production sets both `cors` and `csrf` to `[serverURL]`, locking the application to a single allowed origin.

## Consequences

- **Simple deployment**: No external auth provider, token store, or Redis required
- **Single-process dependency**: In-memory rate limits do not synchronize across processes (see ADR 0001)
- **Trust levels require admin action**: New self-registered users start at BASIC; promotion is manual
- **Quota overrides are per-user**: No group-based or organization-level quota policies exist yet
- **Field-level access is declarative**: Adding a sensitive field requires only an `access` block in the collection config
- **Daily quota resets are lazy**: Counters reset on next access after midnight UTC, not via a scheduled job, so inactive users accumulate no overhead
