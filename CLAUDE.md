# TimeTiles Monorepo Instructions

> AI assistant guide for the TimeTiles monorepo. For package-specific details, see individual CLAUDE.md files in apps/ and packages/.

## Overview

TimeTiles is an open source geospatial event management platform that:

- Imports events from CSV/Excel/ODS files or scheduled URLs
- Geocodes event locations using PostGIS
- Displays events on interactive maps with clustering
- Provides temporal filtering (histograms) and spatial search
- Manages datasets, catalogs, and import workflows
- Runs user-defined web scrapers in isolated Podman containers (optional)

---

## Core Behavior (Priority Order)

### Critical Constraints

1. **Work at project root**: Stay in `/Users/user/code/jf/timetiles/` for all operations
2. **Edit over create**: Modify existing files; create new files only when functionality cannot be added elsewhere
3. **Reuse over reinvent**: Check `lib/utils/`, `lib/services/`, `lib/hooks/`, `packages/ui/` before writing new code
4. **Use AI-optimized commands**: Always use `make check-ai`, `make test-ai`, `make test-e2e` (not pnpm commands)
5. **Worktrees in `.worktrees/`**: Create git worktrees in the `.worktrees/` directory (gitignored)

### Interaction Rules

5. **Ask before acting**: Do not fix issues or make changes without explicit user request
6. **Complete what you start**: Finish every task fully regardless of conversation length
7. **Sub-agent discipline**: When launching sub-agents, instruct them to stay in the correct worktree/branch if one is active. Sub-agents must **not** perform git operations (e.g. stash, stash pop, checkout, reset, etc.). If a git operation is needed, ask the user for permission in the main agent first.

### Quality Anchor: Complete Real Work

Every task requires three verifiable steps:

1. **Implement fully**: Write all code, tests, and documentation the feature requires
2. **Run verification**: Execute `make check-ai` and `make test-ai` - both must pass
3. **Confirm outcome**: Read output to verify expected behavior (never assume success)

---

## Commands Reference

| Task                 | Command                                       | Notes                         |
| -------------------- | --------------------------------------------- | ----------------------------- |
| Check code quality   | `make check-ai`                                | Lint + typecheck all packages |
| Check single package | `make check-ai PACKAGE=web`                    | Faster iteration              |
| Check specific files | `make check-ai FILES="lib/foo.ts lib/bar.ts"`  | Fastest — lint + typecheck    |
| Run all tests        | `make test-ai`                                 | AI-optimized output           |
| Run filtered tests   | `make test-ai FILTER=pattern`                  | 24-120x faster                |
| Run E2E tests        | `make test-e2e`               | Playwright tests              |
| Check scraper        | `make check-ai PACKAGE=scraper`            | Lint + typecheck              |
| Start dev server     | `make dev`                    | Auto-starts infrastructure    |
| Start Storybook      | `make storybook`              | UI component explorer on :6006|
| Check CVA variants   | `make check-cva`              | Detect duplicate/empty CVA    |
| Reset database       | `make db-reset`               | Full reset                    |
| Fresh start          | `make fresh`                  | Clean + up + migrate + seed   |

**Warning**: Standard `pnpm` commands produce verbose output that's difficult for AI to parse. Always use `make` commands.

**Database mode**: Set `PG_MODE=local` in `.env` for Homebrew PostgreSQL (port 5433) or `PG_MODE=docker` (default, port 5432). All `make` commands respect this setting.

---

## Configuration System

Three-layer config with centralized validation:

| Layer | Source | Module | Purpose |
| --- | --- | --- | --- |
| **Env vars** | `.env` | `lib/config/env.ts` → `getEnv()` | Secrets, infrastructure, paths |
| **Config file** | `config/timetiles.yml` | `lib/config/app-config.ts` → `getAppConfig()` | Rate limits, quotas, batch sizes, cache |
| **Database** | Payload CMS globals | Settings, Branding, etc. | Feature flags, geocoding, branding |

- **`getEnv()`**: Zod-validated lazy singleton. All `process.env` reads in `lib/` go through this (except `ALLOW_PRIVATE_URLS` which uses bracket notation to prevent webpack inlining).
- **`getAppConfig()`**: Reads optional `config/timetiles.yml`, deep-merges with defaults. Each setting lives in exactly one place — no dual-source.
- Constants files (`rate-limits.ts`, `quota-constants.ts`, `ingest-constants.ts`, `account-constants.ts`) are bridges that read from `getAppConfig()`.
- Tests must call `resetEnv()` / `resetAppConfig()` when stubbing env vars (already in global `beforeEach`).

---

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **React**: Version 19
- **TypeScript**: Strict mode enabled
- **State Management**: React Query (TanStack Query) for server state
- **UI**: Tailwind CSS, Radix UI, shadcn/ui components
- **CMS**: Payload CMS 3 (headless, integrated mode)
- **Database**: PostgreSQL 17 + PostGIS 3.5 (spatial data)
- **Maps**: MapLibre GL JS
- **Geocoding**: Multi-provider (Nominatim, Google Maps, OpenCage) via Payload CMS config
- **File Processing**: Papa Parse (CSV), ExcelJS, Sharp (images)
- **Testing**: Vitest (unit/integration), Playwright (E2E)
- **Scraper Isolation**: Podman (rootless containers)
- **i18n**: next-intl (English, German) with locale-prefix routing

## Key Directories

```
apps/web/
├── app/                    # Next.js App Router
│   ├── (payload)/         # Payload CMS dashboard routes
│   ├── [locale]/(frontend)/ # Locale-aware frontend pages
│   └── api/               # API endpoints
├── components/            # React components
├── i18n/                  # next-intl config (routing, locale detection)
├── messages/              # Translation files (en.json, de.json)
├── lib/                   # Core logic (layered architecture)
│   ├── utils/            # Layer 0: Pure cross-cutting utilities
│   ├── security/         # Layer 0: Crypto, sanitization, SSRF protection
│   ├── types/            # Layer 0: Domain type definitions
│   ├── constants/        # Layer 0: App constants (quotas, rate limits, map)
│   ├── geospatial/       # Layer 0: Coordinate parsing, validation, bounds
│   ├── filters/          # Layer 0: Canonical filter model, SQL/Payload adapters
│   ├── services/         # Layer 1: Cross-cutting services (audit, quota, etc.)
│   ├── database/         # Layer 1: Database client & setup
│   ├── middleware/        # Layer 1: Rate limiting, auth middleware
│   ├── import/           # Layer 2: Import pipeline (readers, transforms, state)
│   ├── ingest/           # Layer 2: Ingest helpers (config, schema, preview, transforms)
│   ├── account/          # Layer 2: Account lifecycle (deletion, system user)
│   ├── export/           # Layer 2: Data export (service, emails, formatting)
│   ├── email/            # Layer 2: Email service, templates, i18n
│   ├── collections/      # Layer 2: Payload CMS collections
│   ├── api/              # Layer 3: API route handler, error classes
│   ├── hooks/            # Layer 3: React Query hooks (35 hooks)
│   ├── jobs/             # Layer 3: Background job handlers (20 jobs)
│   ├── blocks/           # Layer 3: Page builder blocks
│   ├── globals/          # Payload globals (Branding, Footer, MainMenu, Settings)
│   └── config/           # Payload config factory & shared config
├── migrations/           # Database migrations
├── tests/               # Test suites
└── payload.config.ts    # Payload CMS configuration

apps/timescrape/              # TimeScrape runner (optional)
├── src/                   # Hono API server
├── images/                # Base container images (Python, Node.js)
└── examples/              # Example scrapers
```

## Packages

Located in `packages/`:

| Package                    | Purpose                            |
| -------------------------- | ---------------------------------- |
| `ui`                       | Shared UI components (shadcn/ui)   |
| `scraper`                  | Scraper SDK for Node.js (`@timetiles/scraper`) |
| `python`                   | Python SDK (`pip install timetiles`)           |
| `assets`                   | Logos and static assets (Git LFS)  |
| `payload-schema-detection` | CSV/Excel schema detection         |
| `eslint-config`            | Shared ESLint configuration        |
| `typescript-config`        | Shared TypeScript configuration    |
| `prettier-config`          | Shared Prettier configuration      |

## Code Standards

### TypeScript & Imports

- **Named imports only**: `import { foo } from 'bar'` (not default imports)
- **TypeScript strict mode**: All code must pass strict type checking
- **No console.log**: Use `logger.info()` and `logError()` from `@/lib/logger`

### Geospatial Code

- **PostGIS for queries**: Use PostGIS functions for clustering, distance calculations, spatial operations
- **Coordinate order**: Always [longitude, latitude] (GeoJSON standard)
- **MapLibre GL JS**: Frontend mapping library
- **Geometry types**: Store all geospatial data as proper PostGIS geometry types

### Documentation (TypeDoc)

Place file-level documentation **before** imports with `@module` and `@category` tags:

```typescript
/**
 * Brief description of what this module does.
 *
 * @module
 * @category Services|Collections|Components
 */
import { something } from "somewhere";
```

### Logging

Use `logger.info()` and `logError()` from `@/lib/logger` - never `console.log`.

### Data Fetching

Always use React Query hooks from `lib/hooks/` - never fetch directly in components.

## Payload CMS

### Configuration

- **Config File**: `payload.config.ts` (delegates to `lib/config/payload-config-factory.ts`)
- **Shared Config**: `lib/config/payload-shared-config.ts` — collections, globals, jobs registry
- **Mode**: Integrated with Next.js (not standalone)
- **Dashboard**: Available at `/dashboard` route

### Collections

Located in `lib/collections/`, grouped by domain:

- **Data**: Events, Datasets, DatasetSchemas
- **Ingest**: IngestFiles, IngestJobs, ScheduledIngests
- **Content**: Pages, Media
- **System**: Users, UserUsage, GeocodingProviders, LocationCache, AuditLog, DataExports
- **Configuration**: Sites, Views, Catalogs, CatalogOwnership, Themes, LayoutTemplates
- **Scraper**: ScraperRepos, Scrapers, ScraperRuns

### Globals

Located in `lib/globals/`:

- Branding — Site name, description, logos, favicon
- Footer — Footer sections and links
- MainMenu — Navigation menu links
- Settings — Newsletter integration, geocoding config

### Migrations

```bash
# Create migration (auto-generates from schema changes)
pnpm payload:migrate:create

# Run migrations
pnpm payload:migrate

# IMPORTANT: Never create migrations manually
```

### Hooks

Payload hooks (`beforeChange`, `afterChange`, `beforeRead`, `afterRead`) handle validation, side effects, and data enrichment. See existing hooks in `lib/collections/` for patterns.

## API Endpoints

### Custom API Routes

**Public API (v1)**:
- `/api/v1/events` — list, filter, search
- `/api/v1/events/geo` — geospatial queries + `/geo/stats`
- `/api/v1/events/bounds` — map bounds
- `/api/v1/events/temporal` — time-based data
- `/api/v1/events/stats` — aggregate statistics
- `/api/v1/data-sources` — data source listing
- `/api/v1/sources/stats` — source statistics
- `/api/v1/datasets/[id]/schema/infer` — schema inference

**Ingest**:
- `/api/ingest/preview-schema` — schema preview (+ `/upload`, `/url` sub-routes)
- `/api/ingest/configure` — configure ingest mapping
- `/api/ingest/validate-preview` — validate preview data
- `/api/ingest/update-schedule` — update scheduled ingest settings
- `/api/ingest/[ingestId]/progress` — ingest progress
- `/api/ingest/jobs/failed/recommendations` — failed job recommendations
- `/api/ingest-jobs/[id]/reset`, `/retry` — job management

**Account & Auth**:
- `/api/auth/register` — user registration
- `/api/users/change-email`, `change-password` — account management
- `/api/users/schedule-deletion`, `cancel-deletion` — account deletion
- `/api/account/deletion-summary` — deletion impact preview

**Admin**:
- `/api/admin/health` — admin health check
- `/api/admin/schedule-service` — schedule management
- `/api/admin/jobs/run` — manual job trigger

**Other**:
- `/api/health` — health check
- `/api/feature-flags` — feature flag state
- `/api/quotas` — user quota info
- `/api/catalogs/with-datasets` — catalogs with nested datasets
- `/api/data-exports/request`, `[id]/download` — data export
- `/api/geocoding/test` — geocoding provider test
- `/api/legal-notices` — legal notices
- `/api/newsletter/subscribe` — newsletter signup
- `/api/scheduled-ingests/[id]/trigger` — manual trigger
- `/api/webhooks/trigger/[token]` — webhook triggers
- `/api/preview` — draft content preview

**Scraper**:
- `/api/scrapers/[id]/run` — manual scraper trigger
- `/api/scraper-repos/[id]/sync` — force manifest re-sync
- `/api/webhooks/trigger/[token]` — webhook trigger (shared with scheduled imports)

### Payload REST API

Auto-generated endpoints at `/api/{collection}`:

- GET `/api/events` - List events
- POST `/api/events` - Create event
- PATCH `/api/events/{id}` - Update event
- DELETE `/api/events/{id}` - Delete event

## MCP Tools

| Tool           | Purpose                                                        |
| -------------- | -------------------------------------------------------------- |
| **Playwright** | Browser automation for E2E testing, screenshots, UI validation |
| **Context7**   | Fetch up-to-date library documentation and code examples       |

## Testing

### Test Organization

```
tests/
├── unit/                  # Pure logic tests (fast, no DB)
├── integration/           # API/DB integration tests
└── e2e/                   # End-to-end Playwright tests
```

### Test Credentials

**Always use centralized test credentials** to avoid SonarCloud security warnings:

```typescript
import { TEST_CREDENTIALS, TEST_EMAILS } from "../constants/test-credentials";

// ✅ CORRECT - Use constants
const testUser = await payload.create({
  collection: "users",
  data: {
    email: TEST_EMAILS.admin,
    password: TEST_CREDENTIALS.basic.password,
    role: "admin",
  },
});
```

**Available Constants** (in `tests/constants/test-credentials.ts`):

- `TEST_CREDENTIALS.basic.password` - Standard test password
- `TEST_CREDENTIALS.bearer.token` - API tokens
- `TEST_EMAILS.admin`, `TEST_EMAILS.user` - Test emails
- `TEST_SECRETS.payloadSecret` - Payload secret

### Inspecting Results

All `make test-ai` runs save timestamped results to `apps/web/.test-results/`:

```bash
# Inspect the latest result file
cat apps/web/.test-results/$(ls -t apps/web/.test-results/ | head -1) | jq '.testResults[] | select(.status=="failed") | .name'
```

## Import System

### File Processing

Supports CSV, Excel, ODS, and JSON API sources with:

1. Schema detection
2. User approval workflow
3. Geocoding integration
4. Batch processing
5. Progress tracking

### Job Processing Stages

1. `UPLOAD` - File uploaded
2. `SCHEMA_DETECTION` - Detect file structure
3. `AWAITING_APPROVAL` - User reviews schema
4. `VALIDATION` - Validate data
5. `GEOCODING` - Geocode locations
6. `PROCESSING` - Create events
7. `COMPLETED` - Import finished

## Performance Considerations

1. **Database Queries**: Use proper indexes, especially for geospatial queries
2. **React Query**: Configure stale times appropriately
3. **Map Clustering**: Use PostGIS functions for server-side clustering
4. **File Processing**: Stream large files, don't load into memory
5. **Background Jobs**: Process imports asynchronously

## Troubleshooting

| Problem                         | Solution                                     |
| ------------------------------- | -------------------------------------------- |
| Tests failing with DB errors    | `make db-reset` then `make test-ai`          |
| TypeScript errors after updates | `pnpm install` then `make check-ai`          |
| Dev server won't start          | `make status` then `make fresh`              |
| E2E tests failing               | `make test-e2e` (auto-sets up test database) |


## Important Notes

1. **Package Management**: Use pnpm for all dependency operations
2. **PostGIS Functions**: Required for map clustering and spatial queries
3. **Migrations**: Always use Payload's migration system (never create manually)
4. **Error Handling**: Log all errors with context using `logger` and `logError`
5. **Testing**: Never use mocks for database or external services
6. **Geospatial Data**: Always use [longitude, latitude] coordinate order (GeoJSON standard)
7. **Terminology**: "ingest" is the internal/technical term; "import" is the user-facing term. Both refer to the same file processing pipeline. Collections use "ingest" (`ingest-jobs`, `ingest-files`); the UI says "Import".
