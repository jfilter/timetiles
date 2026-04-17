/**
 * Canonical filter builder for event queries.
 *
 * Single entry point that applies access control, normalizes dates,
 * validates field keys, and produces a {@link CanonicalEventFilters}
 * object for downstream adapters.
 *
 * @module
 * @category Filters
 */
import type { EventFilters as EventQueryParams } from "@/lib/schemas/events";

import type { CanonicalBounds, CanonicalEventFilters } from "./canonical-event-filters";
import { sanitizeFieldFilters } from "./field-validation";

/**
 * Options for building canonical event filters.
 */
export interface BuildCanonicalFiltersOptions {
  /** Zod-validated query parameters */
  parameters: EventQueryParams;
  /** Whether public events should be included */
  includePublic?: boolean;
  /** Catalog owner ID for owner-visible reads */
  ownerId?: number | null;
  /** Whether the requested catalog is accessible to the caller */
  hasRequestedCatalogAccess?: boolean;
  /** Require events to have geocoded locations (default: false) */
  requireLocation?: boolean;
}

/**
 * Build canonical event filters with access control and normalization.
 *
 * Consolidates logic previously spread across event-filters.ts,
 * aggregation-filters.ts, event-sql-filters.ts, and events/route.ts.
 */
export const buildCanonicalFilters = ({
  parameters,
  includePublic = true,
  ownerId,
  hasRequestedCatalogAccess,
  requireLocation = false,
}: BuildCanonicalFiltersOptions): CanonicalEventFilters => {
  const filters: CanonicalEventFilters = { includePublic };

  if (ownerId != null) {
    filters.ownerId = ownerId;
  }

  if (requireLocation) {
    filters.requireLocation = true;
  }

  // Explicit catalog filter: resolve access up-front so downstream adapters
  // only have to apply the scoped catalog constraint.
  if (parameters.catalog != null) {
    if (hasRequestedCatalogAccess !== false) {
      filters.catalogId = parameters.catalog;
    } else {
      filters.denyResults = true;
    }
  }

  // Datasets
  if (parameters.datasets != null && parameters.datasets.length > 0) {
    filters.datasets = parameters.datasets;
  }

  // Dates (normalize end date to include full day)
  if (parameters.startDate != null) {
    filters.startDate = parameters.startDate;
  }
  const normalizedEnd = normalizeEndDate(parameters.endDate ?? null);
  if (normalizedEnd != null) {
    filters.endDate = normalizedEnd;
  }

  // Bounds
  if (parameters.bounds != null) {
    filters.bounds = {
      north: parameters.bounds.north,
      south: parameters.bounds.south,
      east: parameters.bounds.east,
      west: parameters.bounds.west,
    } satisfies CanonicalBounds;
  }

  // Field filters (validate keys at construction time)
  if (Object.keys(parameters.ff).length > 0) {
    const sanitized = sanitizeFieldFilters(parameters.ff);
    if (Object.keys(sanitized).length > 0) {
      filters.fieldFilters = sanitized;
    }
  }

  // H3 cell filter (precise spatial constraint)
  if (parameters.clusterCells != null && parameters.h3Resolution != null) {
    const cells = parameters.clusterCells.split(",").filter(Boolean);
    if (cells.length > 0) {
      filters.clusterCells = cells;
      filters.h3Resolution = parameters.h3Resolution;
    }
  }

  // Scope constraints (view-level data scope)
  applyScopeConstraints(filters, parameters);

  return filters;
};

/** Apply view-level scope constraints (scopeCatalogs / scopeDatasets). */
const applyScopeConstraints = (filters: CanonicalEventFilters, parameters: EventQueryParams): void => {
  if (filters.denyResults) return;

  const { scopeCatalogs, scopeDatasets } = parameters;

  if (scopeCatalogs != null && scopeCatalogs.length > 0) {
    applyCatalogScope(filters, scopeCatalogs);
  }

  if (!filters.denyResults && scopeDatasets != null && scopeDatasets.length > 0) {
    applyDatasetScope(filters, scopeDatasets);
  }
};

/** Intersect catalog access with view scope. */
const applyCatalogScope = (filters: CanonicalEventFilters, scopeCatalogs: number[]): void => {
  if (filters.catalogId != null) {
    if (!scopeCatalogs.includes(filters.catalogId)) {
      filters.denyResults = true;
      filters.catalogId = undefined;
    }
    return;
  }

  filters.catalogIds = scopeCatalogs;
};

/** Intersect user dataset selection with view scope. */
const applyDatasetScope = (filters: CanonicalEventFilters, scopeDatasets: number[]): void => {
  if (filters.datasets != null && filters.datasets.length > 0) {
    const intersection = filters.datasets.filter((id) => scopeDatasets.includes(id));
    if (intersection.length === 0) {
      filters.denyResults = true;
    } else {
      filters.datasets = intersection;
    }
  } else {
    filters.datasets = scopeDatasets;
  }
};

/**
 * Normalize end date to include the full day (23:59:59.999Z).
 *
 * @param endDate - ISO date string (e.g., "2024-12-31") or datetime string
 * @returns ISO datetime string with time set to end of day, or null
 */
export const normalizeEndDate = (endDate: string | null): string | null => {
  if (!endDate) return null;
  if (endDate.includes("T")) return endDate;
  return `${endDate}T23:59:59.999Z`;
};
