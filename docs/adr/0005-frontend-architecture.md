# ADR 0005: Frontend Architecture

## Status

Accepted

## Context

TimeTiles is a geospatial event management platform with an interactive map, temporal filtering, and data import workflows. The frontend needs to handle real-time map interactions, server state synchronization, URL-shareable filter state, and a reusable component library across the monorepo.

## Decision

### Data Fetching: React Query

All server state is managed via TanStack Query (React Query) through centralized hooks in `lib/hooks/`.

| Hook                        | Purpose                      | Strategy                              |
| --------------------------- | ---------------------------- | ------------------------------------- |
| `useEventsListQuery`        | Paginated event listing      | Fetch on filter change                |
| `useMapClustersQuery`       | PostGIS cluster data for map | Fetch on viewport change              |
| `useHistogramQuery`         | Time-based histogram         | Fetch on date range change            |
| `useImportJobProgressQuery` | Import job status            | Poll every 2s, stop on terminal state |
| `useDataSourcesQuery`       | Datasets and catalogs        | Standard query                        |
| `useFeatureFlags`           | Feature flag state           | Cached with TTL                       |

**Key pattern:** Import job polling uses `refetchInterval` that returns `false` on completion/failure/error, `2000` otherwise.

**Reference:** `lib/hooks/use-events-queries.ts`, `lib/hooks/use-chart-query.ts`

### Map Rendering: MapLibre GL JS

| Decision         | Choice                                     | Rationale                                                  |
| ---------------- | ------------------------------------------ | ---------------------------------------------------------- |
| Map library      | MapLibre GL JS via `react-map-gl`          | Open-source, no token required                             |
| Clustering       | Server-side via PostGIS `ST_ClusterKMeans` | Handles millions of events without browser memory pressure |
| Coordinate order | [longitude, latitude] everywhere           | GeoJSON standard                                           |
| Styles           | Default, light, dark, satellite            | Configurable per View                                      |

The map component (`components/maps/clustered-map.tsx`) exposes a `ClusteredMapHandle` ref for programmatic control (resize, fitBounds).

**Reference:** `components/maps/clustered-map.tsx`, `components/maps/clustered-map-helpers.ts`, `lib/constants/map.ts`

### State Management: Four Layers

| Layer           | Tool              | What It Stores                                        | Persistence                                  |
| --------------- | ----------------- | ----------------------------------------------------- | -------------------------------------------- |
| Server state    | React Query       | Events, datasets, catalogs, import jobs               | In-memory cache with configurable stale time |
| Client state    | Zustand           | Filter drawer open, theme, map bounds, selected event | localStorage (drawer + theme only)           |
| Filter state    | nuqs (URL params) | Catalog, datasets, date range, field filters          | URL search params                            |
| Server-resolved | React Context     | Site branding, View configuration                     | None (set once from server, read-only)       |

**Why URL-based filters:** Shareable links. A user can copy the URL with active filters and share it. The View system can also set `defaultFilters` that pre-populate on load.

**Guidelines — choosing the right tool:**

- **Zustand** for client-side state that changes (UI toggles, map viewport, wizard form state)
- **React Context** for dependency injection of server-resolved, read-only data (`SiteContext`, `ViewContext`) and compound component patterns (`packages/ui`)
- **React Query** for server state with caching and polling
- **nuqs** for filter state that should be shareable via URL
- **Never** use Context + `useReducer` for complex changing state — use Zustand instead

Context is a dependency injection mechanism, not a state management tool. It works well for data that is resolved once (typically server-side) and doesn't change. For state that updates frequently, Context causes unnecessary re-renders of all consumers — Zustand's selective subscriptions avoid this.

**Reference:** `lib/store.ts`, `lib/context/site-context.tsx`, `lib/context/view-context.tsx`

### Component Architecture: Two Tiers

| Tier           | Location                      | Rules                                                                                      |
| -------------- | ----------------------------- | ------------------------------------------------------------------------------------------ |
| Design system  | `packages/ui/src/components/` | No business logic, no data fetching, shadcn/ui + Radix primitives, design-system compliant |
| App components | `apps/web/components/`        | Domain-specific, may fetch data, organized by feature (maps/, filters/, auth/, charts/)    |

The design system (`packages/ui`) exports 120+ components following the Cartographic Design System: Playfair Display (serif), DM Sans (sans-serif), earth-tone palette.

**Reference:** `packages/ui/src/components/`, `packages/ui/docs/DESIGN_SYSTEM.md`

### View System

Views (`lib/collections/views/`) provide configurable UI experiences:

- **Data scope:** Filter to specific catalogs or datasets
- **Filter config:** Auto-detect, manual field selection, or disabled
- **Branding:** Custom domain, logo, favicon, colors, header HTML
- **Map settings:** Default bounds, zoom, center, base map style

Views are resolved by: custom domain → URL slug (`/v/[slug]`) → default view.

**Reference:** `lib/collections/views/index.ts`, `lib/services/view-resolver.ts`, `lib/context/view-context.tsx`

## Consequences

- React Query eliminates manual loading/error state management
- Server-side clustering scales to millions of events without browser performance issues
- URL-based filters enable sharing but add complexity vs simple state management
- Two-tier components enforce separation but require discipline about what goes where
- Zustand is minimal (one store file) — no over-engineering for what's mostly server state
