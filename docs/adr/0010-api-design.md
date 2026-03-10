# ADR 0010: API Design

## Status

Accepted

## Context

TimeTiles exposes HTTP APIs to three distinct consumers: the React frontend (internal), external map embeds and data integrations (public), and Payload CMS admin operations (auto-generated). These consumers have different stability requirements. External consumers need versioned URLs they can depend on across releases. The frontend deploys in lockstep with the server and can tolerate route changes. Payload's auto-generated REST API follows its own conventions.

A consistent approach to authentication, error responses, and input validation is needed across all three categories to keep the codebase predictable.

## Decision

### Two API Categories

API routes are split into **versioned public** and **unversioned internal** based on consumer stability needs.

#### Public Data APIs (`/api/v1/`)

These serve map tiles, event queries, and data source listings. They use the `/api/v1/` prefix so external consumers can rely on URL stability across releases.

| Route | Purpose |
|-------|---------|
| `/api/v1/events` | Event listing with filters |
| `/api/v1/events/geo` | Map cluster GeoJSON |
| `/api/v1/events/geo/stats` | Cluster statistics |
| `/api/v1/events/temporal` | Time-based histogram |
| `/api/v1/events/bounds` | Geographic bounding box |
| `/api/v1/events/stats` | Aggregate event statistics |
| `/api/v1/data-sources` | Data source listing |
| `/api/v1/sources/stats` | Source statistics |
| `/api/v1/datasets/[id]/schema/infer` | Schema inference |

All public data routes use `withOptionalAuth()` because public data is readable by anonymous users, but authenticated users see additional private data they own.

Reference: `app/api/v1/`

#### Internal/Session APIs (unversioned)

These serve the React frontend and admin operations. They have no version prefix because the frontend deploys alongside the server.

| Prefix | Purpose | Auth |
|--------|---------|------|
| `/api/account/` | Password change, email change, data export, account deletion | `withAuth()` |
| `/api/auth/` | Registration | None (public) |
| `/api/import/` | Import progress tracking | `withAuth()` |
| `/api/admin/` | Job management, schedule service | `withAdminAuth()` |
| `/api/webhooks/` | Scheduled import triggers | Token-based |
| `/api/quotas/` | User quota information | `withAuth()` |
| `/api/feature-flags/` | Feature flag state | `withOptionalAuth()` |
| `/api/wizard/` | Import wizard steps | `withAuth()` |
| `/api/health` | Health check | None (public) |

Reference: `app/api/`

#### Payload CMS REST API (`/api/{collection}`)

Payload auto-generates CRUD endpoints for all collections (events, datasets, catalogs, users, etc.). Access control is enforced by Payload's `access` functions on each collection (see ADR 0002). These routes are not versioned and are primarily consumed by the Payload admin dashboard.

### Auth Middleware

Three composable middleware functions in `lib/middleware/auth.ts` handle authentication. Each wraps a route handler and runs authentication before the handler executes.

| Middleware | Behavior | HTTP Response on Failure |
|------------|----------|--------------------------|
| `withAuth()` | Requires a valid session cookie. Attaches `user` to the request. | 401 |
| `withOptionalAuth()` | Attempts authentication but proceeds without it. `user` may be undefined. | None (handler runs either way) |
| `withAdminAuth()` | Requires valid session AND `role === "admin"`. | 401 if unauthenticated, 403 if non-admin |

All three call `payload.auth({ headers })` internally to validate the cookie-based JWT.

Reference: `lib/middleware/auth.ts`

### Error Response Format

All API routes use standardized error helpers from `lib/utils/api-response.ts`. Every error response follows the same shape:

```typescript
interface ErrorResponse {
  error: string;       // Human-readable message
  code?: string;       // Programmatic error code (e.g., "BAD_REQUEST", "NOT_FOUND")
  details?: unknown;   // Optional additional context
}
```

Available helpers:

| Helper | Status | Default Code |
|--------|--------|--------------|
| `badRequest(message)` | 400 | `BAD_REQUEST` |
| `unauthorized(message?)` | 401 | `UNAUTHORIZED` |
| `forbidden(message?)` | 403 | `FORBIDDEN` |
| `notFound(message?)` | 404 | `NOT_FOUND` |
| `methodNotAllowed(message)` | 405 | `METHOD_NOT_ALLOWED` |
| `internalError(message?)` | 500 | `INTERNAL_ERROR` |

Rate-limited responses (429) are produced by `lib/middleware/rate-limit.ts` and include a `Retry-After` header with seconds until the limit resets.

Reference: `lib/utils/api-response.ts`, `lib/middleware/rate-limit.ts`

### Input Validation

Validation is manual rather than schema-based (no Zod or similar library).

| Layer | Approach | Reference |
|-------|----------|-----------|
| API routes | Manual checks on query parameters and request bodies. `parseStrictInteger()` for safe number parsing. `parseBoundsParameter()` for geographic bounds. | `lib/utils/event-params.ts`, `lib/geospatial/` |
| Payload collections | Field-level `validate` functions on collection configs. Payload enforces required fields, types, min/max, and custom validators. | `lib/collections/` |
| Hooks | `beforeChange` hooks enforce business rules (e.g., visibility invariants, privilege escalation prevention). | `lib/collections/*/hooks.ts` |

`parseStrictInteger()` rejects strings like `"12abc"` that `parseInt()` would silently truncate. It is used across all public API routes that accept numeric parameters.

### Why Versioned Prefix for Public but Not Internal

Public APIs have external consumers (map embeds, data integrations, third-party tools) who cannot redeploy when we change a URL or response shape. The `/api/v1/` prefix provides a stability contract: existing URLs and response formats will not break within a major version.

Internal APIs serve the React frontend, which ships in the same deployment. Route changes in the server are matched by corresponding changes in the client code. Versioning these routes would add URL noise with no stability benefit.

## Consequences

- **External consumers get URL stability**: The `/api/v1/` prefix signals that these routes will not break without a version bump. Adding `/api/v2/` in the future is straightforward.
- **Internal routes stay simple**: No version prefix means shorter URLs and less ceremony for routes that only the frontend consumes.
- **Consistent error handling**: All API consumers can rely on the `{ error, code?, details? }` shape. Client-side error parsing needs only one pattern.
- **No schema validation library**: Input validation is scattered across individual route files rather than centralized in schemas. This keeps dependencies minimal but means validation logic is duplicated in places (e.g., bounds parsing appears in multiple routes, mitigated by shared utilities in `event-params.ts`).
- **Auth middleware is composable**: Adding authentication to a new route is a single wrapper (`withAuth(handler)`), not a configuration block. This keeps route files self-documenting about their auth requirements.
- **Rate limit responses are standard**: The `Retry-After` header on 429 responses follows HTTP conventions, allowing well-behaved clients to back off automatically.
