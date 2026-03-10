# ADR 0010: API Design

## Status

Accepted (revised 2026-03-10)

## Context

TimeTiles exposes HTTP APIs to three distinct consumers: the React frontend (internal), external map embeds and data integrations (public), and Payload CMS admin operations (auto-generated). These consumers have different stability requirements. External consumers need versioned URLs they can depend on across releases. The frontend deploys in lockstep with the server and can tolerate route changes. Payload's auto-generated REST API follows its own conventions.

A consistent approach to authentication, error handling, and input validation is needed across all custom API routes.

### Why Not Payload Collection Custom Endpoints

Payload CMS supports registering custom endpoints on collection configs (`endpoints: [...]`). We evaluated this approach and rejected it in favor of Next.js route files exclusively:

1. **Two different patterns for the same thing**: Collection endpoints use `(req: PayloadRequest) => Response` with `req.user`, `req.payload`, `req.routeParams`. Next.js routes use `(req: NextRequest, ctx) => Response` with explicit `getPayload()`. Having both patterns means developers must remember which convention applies where.

2. **No shared middleware**: Collection endpoints cannot use our `apiRoute()` framework for auth, validation, rate limiting, and error handling. Each endpoint must manually implement these concerns, leading to duplication and inconsistency.

3. **Harder to discover and test**: Collection endpoints are defined inside collection configs (often in separate `endpoints.ts` files), not in the `app/api/` directory where routes are conventionally located. This splits the route surface across two directory trees. Unit testing also differs — collection endpoints require mocking `PayloadRequest` objects instead of standard `NextRequest`.

4. **No transaction advantage**: We investigated whether collection endpoints run within Payload's implicit transactions. They do not — both collection endpoints and Next.js route handlers execute outside any implicit transaction. There is no correctness benefit to using collection endpoints.

5. **URL equivalence**: Both approaches produce identical URLs. `POST /api/import-jobs/:id/retry` works the same whether backed by a collection endpoint or a Next.js route file.

**Decision**: All custom API routes use Next.js route files with the `apiRoute()` framework. Payload collection configs define only `access`, `hooks`, and `fields` — never `endpoints`.

## Decision

### apiRoute() Framework

All custom API routes use the `apiRoute()` wrapper from `lib/api/handler.ts`. This provides a single, consistent pattern for:

- **Authentication**: Declarative auth mode (`"required"`, `"optional"`, `"admin"`, `"none"`)
- **Input validation**: Optional Zod schemas for body, query params, and route params
- **Error handling**: Centralized catch that converts typed errors to structured JSON responses
- **Rate limiting**: Composable rate limit configuration
- **Payload access**: Automatic `getPayload()` call, injected into handler context

```typescript
import { z } from "zod";

import { apiRoute, NotFoundError } from "@/lib/api";

export const POST = apiRoute({
  auth: "required",
  rateLimit: { configName: "IMPORT_RETRY" },
  params: z.object({ id: z.string() }),
  handler: async ({ params, payload, user }) => {
    const job = await payload.findByID({
      collection: "import-jobs",
      id: Number(params.id),
      user,
      overrideAccess: false,
    });
    if (!job) throw new NotFoundError("Import job not found");

    // ... business logic ...
    return Response.json({ success: true });
  },
});
```

Every handler receives a typed context object:

| Field     | Type                   | Description                                       |
| --------- | ---------------------- | ------------------------------------------------- | ----------------------------------------------- |
| `req`     | `AuthenticatedRequest` | The original NextRequest with `user` attached     |
| `user`    | `User` or `User        | undefined`                                        | Guaranteed present for `"required"` / `"admin"` |
| `payload` | `Payload`              | Payload CMS instance                              |
| `body`    | `TBody`                | Parsed + validated request body (if schema given) |
| `query`   | `TQuery`               | Parsed + validated query params (if schema given) |
| `params`  | `TParams`              | Parsed + validated route params (if schema given) |

Reference: `lib/api/handler.ts`

### Auth Modes

| Mode         | Behavior                                                        | On Failure |
| ------------ | --------------------------------------------------------------- | ---------- |
| `"required"` | Valid session required. `user` guaranteed in handler.           | 401        |
| `"admin"`    | Valid session + `role === "admin"` required.                    | 401 / 403  |
| `"optional"` | Attempts auth but proceeds without it. `user` may be undefined. | —          |
| `"none"`     | No auth attempted. Public route.                                | —          |

Default is `"required"` if omitted.

### Error Classes

Handlers throw typed errors that the framework catches and converts to JSON responses:

| Error Class       | Status | Code               | Usage                                  |
| ----------------- | ------ | ------------------ | -------------------------------------- |
| `ValidationError` | 400    | `BAD_REQUEST`      | Invalid input, bad parameters          |
| `NotFoundError`   | 404    | `NOT_FOUND`        | Resource doesn't exist                 |
| `ForbiddenError`  | 403    | `FORBIDDEN`        | Authorized but not permitted           |
| `ConflictError`   | 409    | `CONFLICT`         | State conflict (e.g., already running) |
| `AppError`        | any    | custom             | Base class for other status codes      |
| `ZodError`        | 422    | `VALIDATION_ERROR` | Schema validation failure (automatic)  |

Unhandled errors return 500 with a generic message (no stack trace or internal details exposed).

Reference: `lib/api/errors.ts`

### Two API Categories

API routes are split into **versioned public** and **unversioned internal** based on consumer stability needs.

#### Public Data APIs (`/api/v1/`)

These serve map tiles, event queries, and data source listings. They use the `/api/v1/` prefix so external consumers can rely on URL stability across releases.

| Route                                | Purpose                    | Auth       |
| ------------------------------------ | -------------------------- | ---------- |
| `/api/v1/events`                     | Event listing with filters | `optional` |
| `/api/v1/events/geo`                 | Map cluster GeoJSON        | `optional` |
| `/api/v1/events/geo/stats`           | Cluster statistics         | `optional` |
| `/api/v1/events/temporal`            | Time-based histogram       | `optional` |
| `/api/v1/events/bounds`              | Geographic bounding box    | `optional` |
| `/api/v1/events/stats`               | Aggregate event statistics | `optional` |
| `/api/v1/data-sources`               | Data source listing        | `optional` |
| `/api/v1/sources/stats`              | Source statistics          | `optional` |
| `/api/v1/datasets/[id]/schema/infer` | Schema inference           | `required` |

All public data routes use `auth: "optional"` because public data is readable by anonymous users, but authenticated users see additional private data they own.

Reference: `app/api/v1/`

#### Internal/Session APIs (unversioned)

These serve the React frontend and admin operations. They have no version prefix because the frontend deploys alongside the server.

| Prefix                    | Purpose                                      | Auth                 |
| ------------------------- | -------------------------------------------- | -------------------- |
| `/api/users/`             | Email/password change, account deletion      | `required`           |
| `/api/account/`           | Deletion summary                             | `required`           |
| `/api/data-exports/`      | Request and download data exports            | `required`           |
| `/api/import/`            | Import wizard (preview, configure, progress) | `required`           |
| `/api/import-jobs/`       | Retry and reset import jobs                  | `required` / `admin` |
| `/api/catalogs/`          | Catalog queries (with-datasets)              | `required`           |
| `/api/scheduled-imports/` | Trigger scheduled imports                    | `required`           |
| `/api/admin/`             | Job management, schedule service             | `admin`              |
| `/api/geocoding/`         | Test geocoding configuration                 | `admin`              |
| `/api/auth/`              | Registration                                 | `none`               |
| `/api/webhooks/`          | Scheduled import triggers (token auth)       | `none`               |
| `/api/quotas/`            | User quota information                       | `required`           |
| `/api/feature-flags/`     | Feature flag state                           | `optional`           |
| `/api/newsletter/`        | Newsletter subscription                      | `none`               |
| `/api/preview`            | Next.js Draft Mode                           | `required`           |
| `/api/health`             | Health check                                 | `none`               |

Reference: `app/api/`

#### Payload CMS REST API (`/api/{collection}`)

Payload auto-generates CRUD endpoints for all collections (events, datasets, catalogs, users, etc.). Access control is enforced by Payload's `access` functions on each collection (see ADR 0002). These routes are not versioned and are primarily consumed by the Payload admin dashboard.

No custom endpoints are registered on Payload collections. All custom route logic lives in Next.js route files.

### Error Response Format

All API routes produce errors in a consistent shape:

```typescript
interface ErrorResponse {
  error: string; // Human-readable message
  code?: string; // Programmatic error code (e.g., "BAD_REQUEST", "NOT_FOUND")
  details?: unknown; // Optional additional context (e.g., Zod validation issues)
}
```

Rate-limited responses (429) are produced by `lib/middleware/rate-limit.ts` and include a `Retry-After` header with seconds until the limit resets.

Reference: `lib/api/errors.ts`, `lib/utils/api-response.ts`, `lib/middleware/rate-limit.ts`

### Input Validation

All routes that accept user input declare Zod schemas in their `apiRoute()` config. The framework validates `body`, `query`, and `params` before the handler runs — handlers receive parsed, typed objects. No manual `req.json()`, `searchParams.get()`, or `parseInt()` in route files.

| Layer                | Approach                                                                                                                                | Reference                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `apiRoute()` schemas | Zod schemas for `body`, `query`, and `params`. Validated automatically before the handler runs. Failures return 422 with issue details. | `lib/api/handler.ts`                             |
| Shared schemas       | Reusable schemas for common patterns: event filters, bounds, pagination, histogram params. Used across multiple v1 routes.              | `lib/schemas/events.ts`, `lib/schemas/common.ts` |
| Payload collections  | Field-level `validate` functions on collection configs. Payload enforces required fields, types, min/max, and custom validators.        | `lib/collections/`                               |
| Hooks                | `beforeChange` hooks enforce business rules (e.g., visibility invariants, privilege escalation prevention).                             | `lib/collections/*/hooks.ts`                     |

### Why Versioned Prefix for Public but Not Internal

Public APIs have external consumers (map embeds, data integrations, third-party tools) who cannot redeploy when we change a URL or response shape. The `/api/v1/` prefix provides a stability contract: existing URLs and response formats will not break within a major version.

Internal APIs serve the React frontend, which ships in the same deployment. Route changes in the server are matched by corresponding changes in the client code. Versioning these routes would add URL noise with no stability benefit.

## Consequences

- **One pattern for all custom routes**: Every route file uses `apiRoute()`. No need to decide between collection endpoints and route files, or remember different handler signatures.
- **External consumers get URL stability**: The `/api/v1/` prefix signals that these routes will not break without a version bump. Adding `/api/v2/` in the future is straightforward.
- **Internal routes stay simple**: No version prefix means shorter URLs and less ceremony for routes that only the frontend consumes.
- **Consistent error handling**: All API consumers can rely on the `{ error, code?, details? }` shape. Client-side error parsing needs only one pattern. Typed error classes make handler code explicit about failure modes.
- **Payload collections stay focused**: Collection configs define data shape, access control, and lifecycle hooks — not HTTP routing. This keeps collection files smaller and easier to reason about.
- **Auth is declarative**: Adding authentication to a new route is a config key (`auth: "required"`), not a wrapper function. The handler signature changes based on auth mode (guaranteed `user` vs optional `user`).
- **Validation is opt-in**: Routes can use Zod schemas for automatic validation or skip them for simple cases. This avoids forcing schemas on routes that only read query parameters.
- **Rate limit responses are standard**: The `Retry-After` header on 429 responses follows HTTP conventions, allowing well-behaved clients to back off automatically.
