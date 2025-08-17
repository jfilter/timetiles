/**
 * @module Provides shared utility functions for validating geographic coordinates.
 *
 * This module contains a collection of helper functions that are used across different parts
 * of the coordinate detection and validation process. These utilities help in determining
 * if a coordinate is within a valid range, categorizing coordinate values to aid in
 * heuristic analysis, and identifying potential latitude or longitude columns based on
 * statistical properties of their data.
 */

/**
 * Shared coordinate validation utilities
 */

export interface CoordinateSample {
  lat: number | null;
  lon: number | null;
  isValid: boolean;
  originalValues: {
    lat: string;
    lon: string;
  };
}

/**
 * Check if coordinates are valid
 */
export const isValidCoordinate = (lat: number | null, lon: number | null): boolean => {
  if (lat == null || lon == null) {
    return false;
  }

  // Check ranges and suspicious (0,0) - exact zero unlikely except in ocean
  return !(lat < -90 || lat > 90 || lon < -180 || lon > 180 || (lat == 0 && lon == 0));
};

/**
 * Categorize coordinate value by range
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
 * Check if column is a valid latitude candidate
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
 * Check if column is a valid longitude candidate
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
 * Convert value to string safely
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
