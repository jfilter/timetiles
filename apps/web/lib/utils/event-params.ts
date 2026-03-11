/**
 * Shared utilities for event parameter parsing and building.
 *
 * Provides integer parsing utilities used across the codebase and
 * client-side URL parameter builders for event API calls.
 *
 * @module
 * @category Utils
 */

import type { LngLatBounds } from "maplibre-gl";

import type { FilterState } from "../filters";

const INTEGER_PATTERN = /^-?\d+$/;

export const parseStrictInteger = (value: string | number | null | undefined): number | null => {
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  if (!INTEGER_PATTERN.test(trimmedValue)) {
    return null;
  }

  return Number.parseInt(trimmedValue, 10);
};

/** Parse a value as a strict integer, throwing with context if invalid. */
export const requireStrictInteger = (value: string | number, label: string): number => {
  const result = parseStrictInteger(value);
  if (result == null) {
    throw new Error(`Invalid ${label} ID`);
  }
  return result;
};

/** Parse an optional value as a strict integer, passing through null/undefined. */
export const optionalStrictInteger = (
  value: string | number | null | undefined,
  label: string
): number | null | undefined => {
  if (value == null) return value;
  return requireStrictInteger(value, label);
};

export const normalizeStrictIntegerList = (values: Array<string | number>): number[] =>
  values.map((value) => parseStrictInteger(value)).filter((value): value is number => value != null);

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
        ? { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }
        : bounds;

    params.append("bounds", JSON.stringify(boundsData));
  }

  return params;
};
