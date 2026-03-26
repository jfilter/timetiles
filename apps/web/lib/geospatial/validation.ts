/**
 * Coordinate validation utilities.
 *
 * Functions for validating geographic coordinates, including range checks,
 * heuristic analysis, and column detection for data imports.
 *
 * @module
 * @category Geospatial
 */

import type { Coordinates } from "./types";

// Re-export valueToString so geospatial/parsing.ts can still import from here
export { valueToString } from "@/lib/utils/format";

/**
 * Check if coordinates are valid (includes NaN and (0,0) checks).
 *
 * Validates latitude/longitude ranges, rejects NaN, and filters out
 * suspicious (0,0) coordinates which are unlikely to be real
 * locations except in the ocean.
 *
 * @param lat - Latitude value (can be null)
 * @param lon - Longitude value (can be null)
 * @returns True if coordinates are valid and not (0,0)
 */
export const isValidCoordinate = (lat: number | null, lon: number | null): boolean => {
  if (lat == null || lon == null) {
    return false;
  }
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return false;
  }
  // Check ranges and suspicious near-(0,0) — Null Island region in the Gulf of Guinea.
  // Coordinates within ~1km of (0,0) are almost certainly data errors, not real locations.
  const nearNullIsland = Math.abs(lat) < 0.01 && Math.abs(lon) < 0.01;
  return !(lat < -90 || lat > 90 || lon < -180 || lon > 180 || nearNullIsland);
};

/**
 * Check if a coordinate object has valid latitude and longitude.
 *
 * Delegates to {@link isValidCoordinate} for consistent validation
 * including range checks, NaN rejection, and (0,0) filtering.
 *
 * @param coords - Coordinate object with latitude and longitude
 * @returns True if coordinates are valid
 */
export const areValidCoordinates = (coords: Coordinates): boolean => {
  return isValidCoordinate(coords.latitude, coords.longitude);
};
