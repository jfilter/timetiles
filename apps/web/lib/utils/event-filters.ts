/**
 * Shared utilities for building event filter objects with access control.
 *
 * This module consolidates the filter building logic used across event API
 * routes. It handles catalog access control, ensuring users can only query
 * catalogs they have permission to access.
 *
 * @module
 * @category Utils
 */
import type { EventFilters as EventQueryParams } from "@/lib/schemas/events";
import { normalizeEndDate } from "@/lib/services/aggregation-filters";

/**
 * Event filters for SQL/Drizzle queries.
 */
export interface EventFilters {
  /** Single catalog ID when user has access */
  catalogId?: number;
  /** Multiple catalog IDs when filtering by accessible catalogs */
  catalogIds?: number[];
  /** Array of dataset IDs to filter by */
  datasets?: number[];
  /** Start date for temporal filtering */
  startDate?: string | null;
  /** End date for temporal filtering */
  endDate?: string | null;
  /** Geographic bounds for spatial filtering */
  bounds?: { minLng: number; maxLng: number; minLat: number; maxLat: number };
  /** Only include events with geocoded locations */
  requireLocation?: boolean;
  /** When true, no results should be returned (user lacks access) */
  denyAccess?: boolean;
  /** When true, the supplied filters are valid syntax but match no rows */
  denyResults?: boolean;
  /** Field filters for categorical filtering by enum values */
  fieldFilters?: Record<string, string[]>;
}

/**
 * Options for building event filters.
 */
export interface BuildFiltersOptions {
  /** Zod-validated query parameters */
  parameters: EventQueryParams;
  /** Catalog IDs the user has access to */
  accessibleCatalogIds: number[];
  /** Require events to have geocoded locations (default: true) */
  requireLocation?: boolean;
}

/**
 * Build event filters with access control logic.
 *
 * This function handles the common pattern of:
 * 1. If a specific catalog is requested and user has access, filter by that catalog
 * 2. If a specific catalog is requested but user lacks access, filter by all accessible catalogs
 * 3. If no catalog is specified, filter by all accessible catalogs
 *
 * @param options - Filter building options
 * @returns Event filters with access control applied
 */
export const buildEventFilters = ({
  parameters,
  accessibleCatalogIds,
  requireLocation = true,
}: BuildFiltersOptions): EventFilters => {
  const filters: EventFilters = {};

  // Only include events with geocoded locations (default: true for map-related queries)
  if (requireLocation) {
    filters.requireLocation = true;
  }

  // Apply catalog access control
  if (parameters.catalog != null) {
    if (accessibleCatalogIds.includes(parameters.catalog)) {
      filters.catalogId = parameters.catalog;
    } else {
      // Inaccessible catalog should not broaden results.
      filters.denyResults = true;
    }
  } else {
    // No specific catalog requested, filter by all accessible catalogs
    filters.catalogIds = accessibleCatalogIds;
  }

  // Apply dataset filter
  if (parameters.datasets != null && parameters.datasets.length > 0) {
    filters.datasets = parameters.datasets;
  }

  // Apply date filters
  if (parameters.startDate != null) {
    filters.startDate = parameters.startDate;
  }
  const normalizedEndDate = normalizeEndDate(parameters.endDate ?? null);
  if (normalizedEndDate != null) {
    filters.endDate = normalizedEndDate;
  }

  // Apply bounds filter
  if (parameters.bounds != null) {
    filters.bounds = {
      minLng: parameters.bounds.west,
      maxLng: parameters.bounds.east,
      minLat: parameters.bounds.south,
      maxLat: parameters.bounds.north,
    };
  }

  // Apply field filters for categorical filtering
  if (Object.keys(parameters.ff).length > 0) {
    filters.fieldFilters = parameters.ff;
  }

  return filters;
};
