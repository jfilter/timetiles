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

- Import jobs use Payload's job queue
- **Jobs auto-delete after completion** - query pending jobs before running
- Jobs triggered via Payload hooks in `afterChange`
- See `tests/integration/CLAUDE.md` for job testing patterns

**Import pipeline** (8 stages): `dataset-detection` → `analyze-duplicates` → `schema-detection` → `validate-schema` → `create-schema-version` → `geocode-batch` → `create-events-batch`

**System jobs**: `schedule-manager`, `url-fetch`, `quota-reset`, `cache-cleanup`, `schema-maintenance`, `audit-log-ip-cleanup`, `data-export`, `data-export-cleanup`, `execute-account-deletion`, `cleanup-approval-locks`, `cleanup-stuck-scheduled-imports`, `process-pending-retries`, `scraper-execution`, `scraper-repo-sync`

### File Uploads

- CSV/Excel import configured via `lib/services/import-configure-service.ts`
- Schema detection and processing handled by background jobs in `lib/jobs/`
- Large files are streamed (never loaded into memory)
- Schema detection happens in background jobs

### React Query Hooks

- All data fetching uses hooks from `lib/hooks/`
- Never fetch data directly in components
- Hook naming: `use{Entity}{Action}Query` / `use{Entity}Mutations`

**Query hooks**: `useEventsQueries`, `useCatalogsQuery`, `useDataSourcesQuery`, `useScheduledImportsQuery`, `useImportProgressQuery`, `useChartQuery`, `useDataSourceStats`, `useDatasetEnumFields`, `useFeatureFlags`, `usePreviewValidationQuery`

**Mutation hooks**: `useAccountMutations`, `useAuthMutations`, `useFormMutation`, `useImportWizardMutations`, `useScheduledImportMutations`, `useDataExport`

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

### Lib Modules

```
lib/
├── api/          # apiRoute() handler, error classes
├── blocks/       # Page builder blocks (hero, features, CTA, etc.)
├── collections/  # Payload CMS collection configs
├── config/       # Payload config factory
├── constants/    # App constants (quotas, rate limits, map defaults)
├── context/      # React contexts (site, view)
├── database/     # Database setup and operations
├── email/        # Email service (account deletion, exports)
├── filters/      # Canonical filter model, SQL/Payload adapters
├── geospatial/   # Coordinate parsing, validation, bounds, distance
├── globals/      # Payload globals (Branding, Footer, MainMenu, Settings)
├── hooks/        # React Query hooks (27 hooks)
├── jobs/         # Background job handlers (18 jobs)
├── middleware/    # Rate limiting, auth middleware
├── openapi/      # OpenAPI schema generation
├── schemas/      # Zod validation schemas
├── seed/         # Database seeding
├── services/     # Business logic services
├── types/        # Domain type definitions
└── utils/        # Utility functions (file readers, cron, URL validation, etc.)
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
