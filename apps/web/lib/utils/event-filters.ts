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
import type { MapBounds } from "@/lib/geospatial";

import type { BaseEventParameters } from "./event-params";

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
  bounds?: {
    minLng: number;
    maxLng: number;
    minLat: number;
    maxLat: number;
  };
  /** Only include events with geocoded locations */
  requireLocation?: boolean;
  /** When true, no results should be returned (user lacks access) */
  denyAccess?: boolean;
}

/**
 * Options for building event filters.
 */
export interface BuildFiltersOptions {
  /** Event parameters from request */
  parameters: BaseEventParameters;
  /** Catalog IDs the user has access to */
  accessibleCatalogIds: number[];
  /** Optional geographic bounds */
  bounds?: MapBounds | null;
  /** Parse dataset IDs as integers (default: true) */
  parseDatasetIds?: boolean;
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
  bounds,
  parseDatasetIds = true,
  requireLocation = true,
}: BuildFiltersOptions): EventFilters => {
  const filters: EventFilters = {};

  // Only include events with geocoded locations (default: true for map-related queries)
  if (requireLocation) {
    filters.requireLocation = true;
  }

  // Apply catalog access control
  if (parameters.catalog != null && parameters.catalog !== "") {
    const catalogId = parseInt(parameters.catalog);
    // Only include if user has access to this catalog
    if (accessibleCatalogIds.includes(catalogId)) {
      filters.catalogId = catalogId;
    } else {
      // User trying to access catalog they don't have permission for - deny access
      filters.denyAccess = true;
    }
  } else {
    // No specific catalog requested, filter by all accessible catalogs
    filters.catalogIds = accessibleCatalogIds;
  }

  // Apply dataset filter
  if (parameters.datasets.length > 0 && parameters.datasets[0] !== "") {
    filters.datasets = parseDatasetIds ? parameters.datasets.map((d) => parseInt(d)) : undefined;
  }

  // Apply date filters
  if (parameters.startDate != null) {
    filters.startDate = parameters.startDate;
  }
  if (parameters.endDate != null) {
    filters.endDate = parameters.endDate;
  }

  // Apply bounds filter
  if (bounds != null) {
    filters.bounds = {
      minLng: bounds.west,
      maxLng: bounds.east,
      minLat: bounds.south,
      maxLat: bounds.north,
    };
  }

  return filters;
};

/**
 * Build filters for map clusters query (uses string catalog, not parsed).
 *
 * This is a specialized version for the map-clusters endpoint which
 * passes catalog as a string to the cluster_events SQL function.
 *
 * @param parameters - Event parameters from request
 * @param accessibleCatalogIds - Catalog IDs the user has access to
 * @returns Filters with catalog as string for SQL function
 */
export const buildMapClusterFilters = (
  parameters: BaseEventParameters,
  accessibleCatalogIds: number[]
): Record<string, unknown> => {
  const filters: Record<string, unknown> = {};

  // Apply catalog access control
  if (parameters.catalog != null) {
    const catalogId = parseInt(parameters.catalog);
    // Only include if user has access to this catalog
    if (accessibleCatalogIds.includes(catalogId)) {
      filters.catalog = parameters.catalog;
    } else {
      // User trying to access catalog they don't have permission for - deny access
      filters.denyAccess = true;
    }
  } else {
    // No specific catalog requested, filter by all accessible catalogs
    filters.accessibleCatalogIds = accessibleCatalogIds;
  }

  // Apply other filters
  if (parameters.datasets.length > 0 && parameters.datasets[0] !== "") {
    filters.datasets = parameters.datasets;
  }
  if (parameters.startDate != null) {
    filters.startDate = parameters.startDate;
  }
  if (parameters.endDate != null) {
    filters.endDate = parameters.endDate;
  }

  return filters;
};
