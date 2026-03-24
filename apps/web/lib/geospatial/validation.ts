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

/**
 * Check if coordinates are valid (includes (0,0) check).
 *
 * Validates both latitude and longitude ranges and filters out
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

  // Check ranges and suspicious (0,0) - exact zero unlikely except in ocean
  return !(lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat == 0 && lon == 0));
};

/**
 * Check if a coordinate object has valid latitude and longitude.
 *
 * @param coords - Coordinate object with latitude and longitude
 * @returns True if both latitude and longitude are within valid ranges
 */
export const areValidCoordinates = (coords: Coordinates): boolean => {
  return (
    coords.latitude >= -90 &&
    coords.latitude <= 90 &&
    coords.longitude >= -180 &&
    coords.longitude <= 180 &&
    !Number.isNaN(coords.latitude) &&
    !Number.isNaN(coords.longitude)
  );
};

/**
 * Convert value to string safely.
 *
 * Handles various data types and converts them to string representation
 * for import processing.
 *
 * @param value - Value to convert (any type)
 * @returns String representation of the value
 */
export const valueToString = (value: unknown): string => {
  if (value == null) {
    return "";
  }
  if (typeof value == "string") {
    return value;
  }
  if (typeof value == "number" || typeof value == "boolean") {
    return String(value);
  }
  if (typeof value == "object") {
    return JSON.stringify(value);
  }
  // symbol, bigint, function — convert to empty string
  return "";
};
