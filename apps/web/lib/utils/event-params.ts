/**
 * Shared utilities for extracting and building event filter parameters.
 *
 * This module consolidates common parameter extraction patterns used across
 * event API routes (list, histogram, map-clusters, cluster-stats). By
 * centralizing this logic, we ensure consistent parameter handling and
 * reduce code duplication.
 *
 * It also provides utilities for building URL query parameters on the client
 * side, ensuring consistent parameter format across all API calls.
 *
 * @module
 * @category Utils
 */

import type { LngLatBounds } from "maplibre-gl";

import type { FilterState } from "../filters";

/**
 * Base parameters common to all event queries.
 */
export interface BaseEventParameters {
  /** Catalog slug or ID to filter by */
  catalog: string | null;
  /** Array of dataset slugs or IDs to filter by */
  datasets: string[];
  /** Start date for temporal filtering (ISO 8601) */
  startDate: string | null;
  /** End date for temporal filtering (ISO 8601) */
  endDate: string | null;
  /** Field filters for categorical filtering by enum values */
  fieldFilters: Record<string, string[]>;
}

/**
 * Parameters for the events list endpoint.
 */
export interface ListParameters extends BaseEventParameters {
  boundsParam: string | null;
  page: number;
  limit: number;
  sort: string;
}

/**
 * Parameters for the histogram endpoint.
 */
export interface HistogramParameters extends BaseEventParameters {
  boundsParam: string | null;
  targetBuckets: number;
  minBuckets: number;
  maxBuckets: number;
}

/**
 * Parameters for the map clusters endpoint.
 */
export interface MapClusterParameters extends BaseEventParameters {
  boundsParam: string | null;
  zoom: number;
}

/**
 * Parameters for the cluster stats endpoint.
 */
export type ClusterStatsParameters = BaseEventParameters;

/** Pattern for valid field path segments: alphanumeric, underscores, hyphens only */
const FIELD_SEGMENT_PATTERN = /^[a-zA-Z0-9_-]+$/;
const INTEGER_PATTERN = /^-?\d+$/;
const MAX_FIELD_KEY_LENGTH = 64;
const MAX_FIELD_FILTERS = 10;

const isValidFieldPath = (fieldPath: string): boolean =>
  fieldPath.length > 0 &&
  fieldPath.length <= MAX_FIELD_KEY_LENGTH &&
  fieldPath.split(".").every((segment) => segment.length > 0 && FIELD_SEGMENT_PATTERN.test(segment));

const parseIntegerParam = (value: string | null, fallback: number): number => {
  if (value == null) {
    return fallback;
  }

  const trimmedValue = value.trim();
  if (!INTEGER_PATTERN.test(trimmedValue)) {
    return fallback;
  }

  return parseInt(trimmedValue, 10);
};

const readOptionalParam = (searchParams: URLSearchParams, key: string): string | null => {
  const value = searchParams.get(key);
  if (value == null) {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
};

/**
 * Sanitize field filter keys to prevent injection via arbitrary paths.
 * Allows dot-separated field paths with alphanumeric/underscore/hyphen segments,
 * limited count and overall path length.
 */
const sanitizeFieldFilters = (raw: Record<string, unknown>): Record<string, string[]> => {
  const result: Record<string, string[]> = {};
  let count = 0;

  for (const [key, values] of Object.entries(raw)) {
    if (count >= MAX_FIELD_FILTERS) break;
    if (!isValidFieldPath(key)) continue;
    if (!Array.isArray(values)) continue;

    const validValues = values.filter((v): v is string => typeof v === "string");
    if (validValues.length > 0) {
      result[key] = validValues;
      count++;
    }
  }

  return result;
};

/**
 * Extract base event parameters from URL search params.
 * These parameters are common to all event API routes.
 *
 * Handles datasets in multiple formats:
 * - Multiple params: `?datasets=1&datasets=2&datasets=3`
 * - Comma-separated: `?datasets=1,2,3`
 * - Mixed: `?datasets=1,2&datasets=3`
 *
 * @param searchParams - URL search parameters
 * @returns Base event parameters
 */
export const extractBaseEventParameters = (searchParams: URLSearchParams): BaseEventParameters => {
  // Get all dataset values and flatten comma-separated values
  const rawDatasets = searchParams.getAll("datasets");
  const datasets = rawDatasets
    .flatMap((d) => d.split(","))
    .map((d) => d.trim())
    .filter(Boolean);

  // Parse and validate field filters from JSON string
  const ffParam = searchParams.get("ff");
  let fieldFilters: Record<string, string[]> = {};
  if (ffParam) {
    try {
      const parsed = JSON.parse(ffParam) as Record<string, unknown>;
      fieldFilters = sanitizeFieldFilters(parsed);
    } catch {
      // Invalid JSON, ignore
    }
  }

  return {
    catalog: readOptionalParam(searchParams, "catalog"),
    datasets,
    startDate: readOptionalParam(searchParams, "startDate"),
    endDate: readOptionalParam(searchParams, "endDate"),
    fieldFilters,
  };
};

/**
 * Extract parameters for the events list endpoint.
 *
 * @param searchParams - URL search parameters
 * @returns List parameters including pagination and sorting
 */
export const extractListParameters = (searchParams: URLSearchParams): ListParameters => ({
  ...extractBaseEventParameters(searchParams),
  boundsParam: searchParams.get("bounds"),
  page: Math.max(1, parseIntegerParam(searchParams.get("page"), 1)),
  limit: Math.min(Math.max(1, parseIntegerParam(searchParams.get("limit"), 100)), 1000),
  sort: readOptionalParam(searchParams, "sort") ?? "-eventTimestamp",
});

/**
 * Extract parameters for the histogram endpoint.
 *
 * @param searchParams - URL search parameters
 * @returns Histogram parameters including bucket configuration
 */
export const extractHistogramParameters = (searchParams: URLSearchParams): HistogramParameters => {
  const clampBuckets = (value: string | null, fallback: number) =>
    Math.min(Math.max(1, parseIntegerParam(value, fallback)), 500);

  return {
    ...extractBaseEventParameters(searchParams),
    boundsParam: searchParams.get("bounds"),
    targetBuckets: clampBuckets(searchParams.get("targetBuckets"), 30),
    minBuckets: clampBuckets(searchParams.get("minBuckets"), 20),
    maxBuckets: clampBuckets(searchParams.get("maxBuckets"), 50),
  };
};

/**
 * Extract parameters for the map clusters endpoint.
 *
 * @param searchParams - URL search parameters
 * @returns Map cluster parameters including zoom level
 */
export const extractMapClusterParameters = (searchParams: URLSearchParams): MapClusterParameters => ({
  ...extractBaseEventParameters(searchParams),
  boundsParam: searchParams.get("bounds"),
  zoom: Math.min(Math.max(0, parseIntegerParam(searchParams.get("zoom"), 10)), 28),
});

/**
 * Extract parameters for the cluster stats endpoint.
 *
 * @param searchParams - URL search parameters
 * @returns Cluster stats parameters (base parameters only)
 */
export const extractClusterStatsParameters = (searchParams: URLSearchParams): ClusterStatsParameters =>
  extractBaseEventParameters(searchParams);

// ============================================================================
// Client-side Parameter Building
// ============================================================================

/**
 * Simple bounds interface for better React Query compatibility.
 * Used when we need a plain object instead of MapLibre's LngLatBounds class.
 */
export interface SimpleBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Bounds can be MapLibre LngLatBounds, SimpleBounds, or null */
export type BoundsType = LngLatBounds | SimpleBounds | null;

/**
 * Build URL search params from filter state without bounds.
 *
 * Use this for API calls that don't require geographic bounds,
 * such as global statistics or bounds calculation endpoints.
 *
 * @param filters - Current filter state
 * @param additionalParams - Extra parameters to include
 * @returns URLSearchParams ready for API call
 */
export const buildBaseEventParams = (
  filters: FilterState,
  additionalParams: Record<string, string> = {}
): URLSearchParams => {
  const params = new URLSearchParams();

  if (filters.catalog != null && filters.catalog !== "") {
    params.append("catalog", filters.catalog);
  }

  if (filters.datasets.length > 0) {
    params.append("datasets", filters.datasets.join(","));
  }

  if (filters.startDate != null && filters.startDate !== "") {
    params.append("startDate", filters.startDate);
  }

  if (filters.endDate != null && filters.endDate !== "") {
    params.append("endDate", filters.endDate);
  }

  // Add field filters if any
  if (filters.fieldFilters && Object.keys(filters.fieldFilters).length > 0) {
    params.append("ff", JSON.stringify(filters.fieldFilters));
  }

  Object.entries(additionalParams).forEach(([key, value]) => {
    params.append(key, value);
  });

  return params;
};

/**
 * Build URL search params from filter state with optional bounds.
 *
 * Handles both MapLibre LngLatBounds objects and plain SimpleBounds objects.
 * Use this for API calls that support geographic filtering.
 *
 * @param filters - Current filter state
 * @param bounds - Geographic bounds (LngLatBounds, SimpleBounds, or null)
 * @param additionalParams - Extra parameters to include
 * @returns URLSearchParams ready for API call
 */
export const buildEventParams = (
  filters: FilterState,
  bounds: BoundsType,
  additionalParams: Record<string, string> = {}
): URLSearchParams => {
  const params = buildBaseEventParams(filters, additionalParams);

  if (bounds) {
    const boundsData =
      "getWest" in bounds
        ? {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
          }
        : bounds;

    params.append("bounds", JSON.stringify(boundsData));
  }

  return params;
};
