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
 * Check if latitude is within valid range.
 *
 * @param value - The latitude value to validate
 * @returns True if latitude is between -90 and 90 degrees
 */
export const isValidLatitude = (value: number): boolean => {
  return value >= -90 && value <= 90;
};

/**
 * Check if longitude is within valid range.
 *
 * @param value - The longitude value to validate
 * @returns True if longitude is between -180 and 180 degrees
 */
export const isValidLongitude = (value: number): boolean => {
  return value >= -180 && value <= 180;
};

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
 * Categorize coordinate value by range.
 *
 * Analyzes a numeric value to determine if it falls within valid
 * latitude range (-90 to 90) or longitude range (-90 to 180).
 * Updates statistics object with the categorization results.
 *
 * @param value - The coordinate value to categorize
 * @param stats - Statistics object to update with categorization results
 */
export const categorizeCoordinateValue = (
  value: number,
  stats: { validCoords: number; latOnly: number; lonOnly: number }
): void => {
  const absValue = Math.abs(value);

  if (absValue <= 90) {
    stats.validCoords++;
    stats.latOnly++;
  } else if (absValue <= 180) {
    stats.validCoords++;
    stats.lonOnly++;
  }
};

/**
 * Check if column is a valid latitude candidate.
 *
 * Evaluates column statistics to determine if it's likely to contain
 * latitude values. Checks that all values are within latitude range
 * and that there's sufficient variation in the data.
 *
 * @param stats - Column statistics including samples and counts
 * @param coordRatio - Ratio of valid coordinates to total values
 * @param bestLatScore - Current best latitude score to beat
 * @returns True if column is a valid latitude candidate
 */
export const isValidLatitudeCandidate = (
  stats: { latOnly: number; total: number; samples: number[] },
  coordRatio: number,
  bestLatScore: number
): boolean => {
  // Check if this column is mostly valid latitudes (all values within -90 to 90)
  if (stats.latOnly == stats.total && coordRatio > bestLatScore) {
    // Check it's not all the same value
    const uniqueValues = new Set(stats.samples).size;
    return uniqueValues > 1;
  }
  return false;
};

/**
 * Check if column is a valid longitude candidate.
 *
 * Evaluates column statistics to determine if it's likely to contain
 * longitude values. Checks for sufficient variation in the data.
 *
 * @param stats - Column statistics including samples
 * @param coordRatio - Ratio of valid coordinates to total values
 * @param bestLonScore - Current best longitude score to beat
 * @returns True if column is a valid longitude candidate
 */
export const isValidLongitudeCandidate = (
  stats: { samples: number[] },
  coordRatio: number,
  bestLonScore: number
): boolean => {
  if (coordRatio > bestLonScore) {
    const uniqueValues = new Set(stats.samples).size;
    return uniqueValues > 1;
  }
  return false;
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
  if (value == null || value == undefined) {
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
  // All cases handled above, this is unreachable
  return "";
};
