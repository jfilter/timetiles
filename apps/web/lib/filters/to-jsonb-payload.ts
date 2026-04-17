/**
 * JSONB output adapter for canonical event filters.
 *
 * Converts {@link CanonicalEventFilters} to a plain object suitable
 * for `JSON.stringify()` and passing to PostgreSQL functions
 * (`cluster_events`, `calculate_event_histogram`).
 *
 * @module
 * @category Filters
 */
import type { CanonicalEventFilters } from "./canonical-event-filters";

/**
 * Convert canonical filters to a JSONB payload for the `cluster_events` PG function.
 *
 * Produces the exact JSON shape the function expects, including the
 * `datasetId` (singular) vs `datasets` (plural) split.
 */
export const toClusteringJsonb = (filters: CanonicalEventFilters): string =>
  JSON.stringify({
    includePublic: filters.includePublic !== false,
    ownerId: filters.ownerId ?? undefined,
    catalogId: filters.catalogId ?? undefined,
    catalogIds: filters.catalogIds != null && filters.catalogIds.length > 0 ? filters.catalogIds : undefined,
    datasetId: filters.datasets?.length === 1 ? filters.datasets[0] : undefined,
    datasets: filters.datasets != null && filters.datasets.length > 1 ? filters.datasets : undefined,
    startDate: filters.startDate,
    endDate: filters.endDate,
    fieldFilters:
      filters.fieldFilters && Object.keys(filters.fieldFilters).length > 0 ? filters.fieldFilters : undefined,
    tagFields: filters.tagFields?.size ? [...filters.tagFields] : undefined,
    clusterCells: filters.clusterCells?.length ? filters.clusterCells : undefined,
    h3Resolution: filters.h3Resolution,
  });

/**
 * Convert canonical filters to a JSONB payload for the `calculate_event_histogram` PG function.
 *
 * Produces the full filter object including bounds in `{minLng, maxLng, minLat, maxLat}` format
 * as expected by the PG function.
 */
export const toHistogramJsonb = (filters: CanonicalEventFilters): string =>
  JSON.stringify({
    includePublic: filters.includePublic !== false,
    ownerId: filters.ownerId ?? undefined,
    catalogId: filters.catalogId ?? undefined,
    catalogIds: filters.catalogIds != null && filters.catalogIds.length > 0 ? filters.catalogIds : undefined,
    datasets: filters.datasets,
    startDate: filters.startDate,
    endDate: filters.endDate,
    bounds: filters.bounds
      ? {
          minLng: filters.bounds.west,
          maxLng: filters.bounds.east,
          minLat: filters.bounds.south,
          maxLat: filters.bounds.north,
        }
      : undefined,
    requireLocation: filters.requireLocation,
    fieldFilters:
      filters.fieldFilters && Object.keys(filters.fieldFilters).length > 0 ? filters.fieldFilters : undefined,
    tagFields: filters.tagFields?.size ? [...filters.tagFields] : undefined,
    clusterCells: filters.clusterCells?.length ? filters.clusterCells : undefined,
    h3Resolution: filters.h3Resolution,
  });
