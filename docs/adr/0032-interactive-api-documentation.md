# ADR 0032: Interactive API Documentation

## Status

Proposed

## Date

2026-03-25

## Context

TimeTiles has a partial OpenAPI infrastructure that generates static spec files but does not serve interactive documentation or cover the full API surface.

### Current State

**What exists:**

- `@asteasolutions/zod-to-openapi` v8.5.0 extends Zod schemas with `.openapi()` metadata
- `lib/openapi/registry.ts` manually registers 7 of ~42 `apiRoute()` endpoints
- `scripts/generate-openapi.ts` produces `public/openapi.json` and `public/openapi.yaml`
- `pnpm openapi:generate` script runs the generator
- Schemas in `lib/schemas/events.ts` and `lib/schemas/common.ts` already carry `.openapi()` names

**What is missing:**

- No interactive documentation UI — only raw JSON/YAML files in `public/`
- 35 of ~42 `apiRoute()` endpoints have no OpenAPI registration
- No CI step validates spec freshness — the committed spec can silently drift
- No authentication support in docs for "Try it out" on protected endpoints

### Route Coverage Breakdown

| Category                | Count | Examples                                                                              |
| ----------------------- | ----- | ------------------------------------------------------------------------------------- |
| **Registered**          | 7     | `/api/v1/events`, `/api/v1/events/geo`, `/api/health`                                 |
| **Missing — public v1** | 3     | `/api/v1/events/bounds`, `/api/v1/data-sources`, `/api/v1/datasets/[id]/schema/infer` |
| **Missing — internal**  | ~32   | `/api/ingest/*`, `/api/users/*`, `/api/admin/*`, `/api/auth/*`, etc.                  |

### Consumers

1. **External integrators** embedding TimeTiles maps or querying event data — need stable `/api/v1/` docs with "Try it out"
2. **Self-hosters** configuring their own instances — need admin API docs
3. **Contributors** working on the frontend or adding API routes — need full coverage

## Decision

### 1. Documentation UI: Scalar

Use `@scalar/nextjs-api-reference` to serve interactive API documentation.

**Why Scalar over alternatives:**

| Criterion                  | Scalar                                       | swagger-ui-react       | Redoc                                |
| -------------------------- | -------------------------------------------- | ---------------------- | ------------------------------------ |
| Next.js App Router support | First-class (`@scalar/nextjs-api-reference`) | Manual React component | CDN script tag or `redoc-cli`        |
| Bundle size                | ~200 KB                                      | ~1.8 MB                | ~700 KB                              |
| "Try it out"               | Built-in with auth                           | Built-in               | Not built-in (requires paid Redocly) |
| Dark mode                  | Built-in, theme-aware                        | Requires custom CSS    | Built-in                             |
| Maintenance                | Active (core product)                        | Maintenance mode       | Active but read-only focus           |

Scalar's Next.js integration is a single route handler — no client bundle, no layout conflicts with the Payload CMS dashboard.

**Implementation:**

```typescript
// app/api-docs/route.ts
import { ApiReference } from "@scalar/nextjs-api-reference";

export const GET = ApiReference({ url: "/openapi.json", theme: "default", darkMode: true });
```

One new dependency, one new route file.

### 2. Hosting Location: `/api-docs`

Serve at `/api-docs` in the main Next.js app, not the separate Nextra docs site. Reasons:

- Same origin means cookie auth works for "Try it out" without CORS configuration
- The docs site is a separate app — it cannot reach the API server
- A link from the docs site to `/api-docs` on the running instance is straightforward

### 3. Coverage Expansion: Phased Manual Registration

**Rejected approach: auto-registration from `apiRoute()`.** Modifying `apiRoute()` to auto-register would require eagerly importing all route files (Next.js loads them lazily), and inline Zod schemas lack `.openapi()` names, summaries, and response schemas — the generated spec would be skeletal.

**Chosen approach: phased manual expansion.**

**Phase 1 — Complete public v1 (3 routes).** Add the 3 missing public routes to the registry. These already have shared schemas. Ship alongside the Scalar UI in a single PR.

**Phase 2 — High-traffic internal routes (~10 routes).** Ingest wizard, auth, account management, data exports. Extract inline Zod schemas into `lib/schemas/` files as needed.

**Phase 3 — Remaining internal and admin routes (~22 routes).** Admin, webhook, scraper, and remaining ingest routes.

Each phase is a standalone PR. Split `registry.ts` into `lib/openapi/routes/*.ts` modules during Phase 2:

```
lib/openapi/
├── registry.ts           # Creates registry, imports route modules
├── routes/
│   ├── events.ts         # /api/v1/events/*
│   ├── sources.ts        # /api/v1/sources/*, /api/v1/data-sources
│   ├── ingest.ts         # /api/ingest/* (Phase 2)
│   ├── auth.ts           # /api/auth/*, /api/users/* (Phase 2)
│   ├── admin.ts          # /api/admin/* (Phase 3)
│   └── system.ts         # /api/health, /api/feature-flags, etc.
```

### 4. CI Spec Freshness Check

Add a CI step to `build.yml` that regenerates the spec and fails if it differs from the committed version:

```yaml
- name: Check OpenAPI spec freshness
  run: |
    pnpm openapi:generate
    git diff --exit-code public/openapi.json public/openapi.yaml || \
      (echo "::error::OpenAPI spec is stale. Run 'pnpm openapi:generate' and commit." && exit 1)
  working-directory: apps/web
```

Fast (< 5 seconds), no database needed. Add a Makefile target for local use:

```makefile
openapi:          ## Regenerate OpenAPI spec
	cd apps/web && pnpm openapi:generate
```

### 5. Authentication in Docs

Register the Payload session cookie as a security scheme:

```typescript
registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "payload-token",
  description: "Session cookie set after login via /api/users/login",
});
```

Routes with `auth: "required"` or `auth: "admin"` include `security: [{ cookieAuth: [] }]`. For "Try it out", users log in to the Payload dashboard first (sets the cookie), then the API docs page (same origin) inherits it automatically.

### 6. Tags

Expand from 2 to 9 tags to organize the full API surface:

| Tag            | Routes                                                                   |
| -------------- | ------------------------------------------------------------------------ |
| Events         | `/api/v1/events/*`                                                       |
| Sources        | `/api/v1/sources/*`, `/api/v1/data-sources`                              |
| Ingest         | `/api/ingest/*`, `/api/ingest-jobs/*`                                    |
| Auth & Account | `/api/auth/*`, `/api/users/*`, `/api/account/*`                          |
| Data Export    | `/api/data-exports/*`                                                    |
| Admin          | `/api/admin/*`, `/api/geocoding/*`                                       |
| Scrapers       | `/api/scrapers/*`, `/api/scraper-repos/*`                                |
| Scheduling     | `/api/scheduled-ingests/*`, `/api/webhooks/*`                            |
| System         | `/api/health`, `/api/feature-flags`, `/api/quotas`, `/api/legal-notices` |

## Out of Scope

- **Payload auto-generated REST API documentation.** Payload's `/api/{collection}` endpoints follow their own schema. Documenting them duplicates Payload's own docs.
- **Auto-registration from `apiRoute()`.** See rejected approach above.
- **OpenAPI 3.1 migration.** Current spec uses 3.0.3; `@asteasolutions/zod-to-openapi` v8 generates 3.0.x. Orthogonal concern.
- **Client SDK generation.** Generating TypeScript/Python clients from the spec is a future possibility.

## Consequences

- **One new dependency** (`@scalar/nextjs-api-reference`) and one route file deliver interactive docs.
- **Spec freshness enforced in CI.** Stale specs caught before merge.
- **Coverage expands incrementally.** Phase 1 ships with the UI. Phases 2-3 are independent follow-ups.
- **No changes to `apiRoute()`** or existing route files in Phase 1.
- **Registry grows linearly with route count.** Manageable at ~42 routes. Reconsider auto-registration if the API exceeds ~100 routes.
- **"Try it out" works via existing cookie auth.** No new auth mechanism needed.
- **Internal routes become discoverable.** Mitigated by existing auth protection; the spec reveals request/response shapes only.
