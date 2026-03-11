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
  /** Catalog IDs the user has access to */
  accessibleCatalogIds: number[];
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
  accessibleCatalogIds,
  requireLocation = false,
}: BuildCanonicalFiltersOptions): CanonicalEventFilters => {
  const filters: CanonicalEventFilters = {};

  if (requireLocation) {
    filters.requireLocation = true;
  }

  // Catalog access control
  if (parameters.catalog != null) {
    if (accessibleCatalogIds.includes(parameters.catalog)) {
      filters.catalogId = parameters.catalog;
    } else {
      filters.denyResults = true;
    }
  } else {
    filters.catalogIds = accessibleCatalogIds;
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

  // Scope constraints (view-level data scope)
  applyScopeConstraints(filters, parameters);

  return filters;
};

/**
 * Apply view-level scope constraints (scopeCatalogs / scopeDatasets).
 *
 * Intersects scope with already-resolved access-control filters.
 * Sets `denyResults` when scope and user selections have empty intersection.
 */
const applyScopeConstraints = (filters: CanonicalEventFilters, parameters: EventQueryParams): void => {
  if (filters.denyResults) return;

  const { scopeCatalogs, scopeDatasets } = parameters;

  // Scope catalogs
  if (scopeCatalogs != null && scopeCatalogs.length > 0) {
    if (filters.catalogId != null) {
      // Specific catalog selected — must be within scope
      if (!scopeCatalogs.includes(filters.catalogId)) {
        filters.denyResults = true;
        filters.catalogId = undefined;
        return;
      }
    } else if (filters.catalogIds != null) {
      // No specific catalog — intersect accessible IDs with scope
      const intersection = filters.catalogIds.filter((id) => scopeCatalogs.includes(id));
      if (intersection.length === 0) {
        filters.denyResults = true;
        return;
      }
      filters.catalogIds = intersection;
    }
  }

  // Scope datasets
  if (scopeDatasets != null && scopeDatasets.length > 0) {
    if (filters.datasets != null && filters.datasets.length > 0) {
      // User selected datasets — intersect with scope
      const intersection = filters.datasets.filter((id) => scopeDatasets.includes(id));
      if (intersection.length === 0) {
        filters.denyResults = true;
        return;
      }
      filters.datasets = intersection;
    } else {
      // No user selection — use scope directly
      filters.datasets = scopeDatasets;
    }
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
