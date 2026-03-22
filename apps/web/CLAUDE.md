# Web Application Instructions

> **See root CLAUDE.md** for commands, code standards, and testing patterns.
> This file covers **web-specific quirks only**.

## Package-Specific Commands

```bash
# Database & Migrations (run in apps/web)
pnpm payload:migrate:create           # Create new migration
pnpm payload:migrate                  # Run pending migrations
pnpm seed development                 # Seed development data
pnpm seed test                        # Seed test data
```

## Web Package Quirks

### Payload CMS Integration

- Payload runs **integrated** with Next.js (not standalone)
- Dashboard (Payload panel) at `/dashboard` route
- Never create migrations manually - use `pnpm payload:migrate:create`
- Migrations auto-generate from schema changes in `lib/collections/`

### Internationalization (i18n)

- Uses next-intl with `localePrefix: "as-needed"` routing
- Supported locales: English (default, no URL prefix), German (`/de/...`)
- All frontend routes under `app/[locale]/(frontend)/`
- Translation files: `messages/en.json`, `messages/de.json`
- Config: `i18n/` directory; locale detection: `middleware.ts`
- Payload dashboard and API routes excluded from locale routing

### Background Jobs

- Ingest pipeline uses **Payload Workflows** (not hook-driven state machine)
- **Jobs auto-delete after completion** — query pending jobs before running
- Workflows queued via Payload `afterChange` hooks (not manually)
- See `tests/integration/CLAUDE.md` for job testing patterns

**3-queue architecture:**

| Queue         | Purpose                           | Workers                                |
| ------------- | --------------------------------- | -------------------------------------- |
| `ingest`      | User-facing ingest workflows      | Production: dedicated Docker container |
| `default`     | Trigger jobs (`schedule-manager`) | Production: dedicated Docker container |
| `maintenance` | Scheduled system jobs             | Production: dedicated Docker container |

**4 ingest workflows** (in `lib/jobs/workflows/`):

| Workflow           | Trigger                                                | Pipeline                                                                                                            |
| ------------------ | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `manual-ingest`    | `ingest-files` afterChange hook                        | dataset-detection → per-sheet: analyze → detect-schema → validate → create-schema-version → geocode → create-events |
| `scheduled-ingest` | `schedule-manager` job                                 | url-fetch → dataset-detection → per-sheet pipeline                                                                  |
| `scraper-ingest`   | `schedule-manager` job                                 | scraper-execution → dataset-detection → per-sheet pipeline                                                          |
| `ingest-process`   | `ingest-jobs` afterChange hook (NEEDS_REVIEW approval) | create-schema-version → geocode → create-events                                                                     |

**Error model:** Tasks throw for failures (Payload retries), return `{ needsReview: true }` for human review, return data for success. Sheets process in parallel via `Promise.allSettled` with per-sheet try/catch.

**System jobs** (Payload native `schedule` property):

| Job                               | Queue       | Schedule       |
| --------------------------------- | ----------- | -------------- |
| `schedule-manager`                | default     | Every minute   |
| `quota-reset`                     | maintenance | Daily midnight |
| `cache-cleanup`                   | maintenance | Every 6 hours  |
| `schema-maintenance`              | maintenance | Daily 3:00 AM  |
| `audit-log-ip-cleanup`            | maintenance | Daily 4:00 AM  |
| `execute-account-deletion`        | maintenance | Daily 2:00 AM  |
| `data-export-cleanup`             | maintenance | Hourly         |
| `cleanup-stuck-scheduled-ingests` | maintenance | Hourly         |
| `cleanup-stuck-scrapers`          | maintenance | Hourly         |

**Standalone task jobs** (queued on demand): `scraper-repo-sync`, `data-export`

### File Uploads

- CSV/Excel import configured via `lib/services/import-configure-service.ts`
- Schema detection and processing handled by background jobs in `lib/jobs/`
- Large files are streamed (never loaded into memory)
- Schema detection happens in background jobs

### React Query Hooks

- All data fetching uses hooks from `lib/hooks/`
- Never fetch data directly in components
- Hook naming: `use{Entity}{Action}Query` / `use{Entity}Mutations`

**Query hooks**: `useEventsQueries`, `useCatalogsQuery`, `useDataSourcesQuery`, `useScheduledImportsQuery`, `useImportProgressQuery`, `useChartQuery`, `useDataSourceStats`, `useDatasetEnumFields`, `useFeatureFlags`, `usePreviewValidationQuery`, `useScraperReposQuery`, `useScrapersQuery`, `useScraperRunsQuery`

**Mutation hooks**: `useAccountMutations`, `useAuthMutations`, `useFormMutation`, `useImportWizardMutations`, `useScheduledImportMutations`, `useDataExport`, `useScraperMutations` (sync, run, delete)

**Utility hooks**: `useFilters`, `useTimeRangeSlider`, `useChartFilters`, `useDebounce`, `useAdminFeatureFlag`, `useViewScope`, `useMediaQuery`, `useTheme`

### API Routes

- Use `apiRoute()` wrapper from `lib/api/handler.ts` for all new routes
- Supports auth modes: `"required"`, `"optional"`, `"admin"`, `"none"`
- Zod validation for body/query/params
- Standard errors: `ValidationError`, `NotFoundError`, `ForbiddenError`, `ConflictError`
- Return plain objects for 200; throw errors for error responses

### Components

```
components/
├── admin/       # Admin-specific UI (header, banners, geocoding panel)
├── auth/        # Auth flows (signin, register, password reset)
├── charts/      # Analytics charts (histogram, etc.)
├── events/      # Event display (detail cards, metadata, sharing)
├── filters/     # Filter UI (data source selector, time slider, enums)
├── layout/      # Page layout (headers, navigation, sidebar)
└── maps/        # Map components (clustering, controls, themes)
```

### Lib Modules (Layered Architecture)

Import rule: each layer can only import from the same layer or below. Enforced via ESLint boundaries.

```
lib/
# Layer 0 — Foundation (no lib/ deps except other foundation)
├── utils/        # Pure cross-cutting utilities (relation-id, date, etc.)
├── security/     # Crypto, sanitization, SSRF protection
├── types/        # Domain type definitions
├── constants/    # App constants (quotas, rate limits, map defaults)
├── geospatial/   # Coordinate parsing, validation, bounds, distance
├── filters/      # Canonical filter model, SQL/Payload adapters
# Layer 1 — Infrastructure (can import Layer 0)
├── services/     # Cross-cutting services (audit, quota, rate-limit, etc.)
├── database/     # Database setup and operations
├── middleware/    # Rate limiting, auth middleware
# Layer 2 — Domain (can import Layer 0 + 1)
├── import/       # Import pipeline (file readers, transforms)
├── account/      # Account lifecycle (deletion, system user)
├── export/       # Data export (service, emails, formatting)
├── email/        # Email service, templates, i18n
├── collections/  # Payload CMS collection configs
# Layer 3 — Application (can import anything)
├── api/          # apiRoute() handler, error classes, auth helpers
├── hooks/        # React Query hooks (27 hooks)
├── jobs/         # Background job handlers (18 jobs)
├── blocks/       # Page builder blocks (hero, features, CTA, etc.)
├── config/       # Payload config factory
├── context/      # React contexts (site, view)
├── globals/      # Payload globals (Branding, Footer, MainMenu, Settings)
├── openapi/      # OpenAPI schema generation
├── schemas/      # Zod validation schemas
└── seed/         # Database seeding
```

### Geospatial Data

- Always use [longitude, latitude] order (GeoJSON standard)
- PostGIS geometry types in database
- Server-side clustering via PostGIS `ST_ClusterKMeans`

## Web-Specific Troubleshooting

| Problem                   | Solution                                                       |
| ------------------------- | -------------------------------------------------------------- |
| "relation does not exist" | `make db-reset && pnpm payload:migrate`                        |
| PostGIS function errors   | `make db-logs` to check, `make db-shell` to verify             |
| Import jobs stuck         | Check `/dashboard/import-jobs`, jobs auto-delete on completion |
| Schema type errors        | `pnpm payload:migrate:create && make check-ai PACKAGE=web`     |

## See Also

- **Root CLAUDE.md** - Commands, code standards, test credentials
- **.claude/DEBUGGING.md** - Import pipeline debugging, log locations, common issues
- **tests/integration/CLAUDE.md** - Background job testing patterns
