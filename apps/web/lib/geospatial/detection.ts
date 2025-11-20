/**
 * Format detection utilities for geospatial data.
 *
 * Functions for detecting how geographic coordinates are formatted in datasets.
 * Supports various combined coordinate formats including:
 * - Comma-separated: "40.7128, -74.0060"
 * - Space-separated: "40.7128 -74.0060"
 * - GeoJSON Point: {"type": "Point", "coordinates": [-74.0060, 40.7128]}
 *
 * These detection functions analyze sample data to identify the coordinate format,
 * enabling automatic parsing during data import.
 *
 * @module
 * @category Geospatial
 */

import { isValidCoordinate } from "./validation";

/**
 * Result of format detection with confidence score.
 */
export interface FormatDetectionResult {
  /** Detected format identifier (e.g., "combined_comma", "combined_space", "geojson") */
  format: string;
  /** Confidence score from 0 to 1 indicating detection reliability */
  confidence: number;
}

/**
 * Check for comma-separated coordinate format.
 *
 * Detects coordinates in the format "lat, lon" with optional spacing.
 * Validates that parsed coordinates fall within valid ranges.
 * Requires at least 70% of samples to match the format for positive detection.
 *
 * @param samples - Array of sample values to check
 * @returns Detection result with confidence score, or null if format not detected
 *
 * @example
 * ```typescript
 * checkCommaFormat(["40.7128, -74.0060", "51.5074, -0.1278"]);
 * // Returns { format: "combined_comma", confidence: 1.0 }
 *
 * checkCommaFormat(["40.7128", "-74.0060"]);
 * // Returns null (not comma-separated)
 * ```
 */
export const checkCommaFormat = (samples: unknown[]): FormatDetectionResult | null => {
  const commaFormat = samples.filter((s) => {
    const commaRegex = /^(-?\d{1,3}\.?\d{0,10}),\s{0,5}(-?\d{1,3}\.?\d{0,10})$/;
    const match = commaRegex.exec(typeof s === "string" || typeof s === "number" ? String(s) : "");
    if (match?.[1] != null && match?.[1] != undefined && match[2] != null && match[2] != undefined) {
      const lat = Number.parseFloat(match[1]);
      const lon = Number.parseFloat(match[2]);
      return isValidCoordinate(lat, lon);
    }
    return false;
  });

  if (commaFormat.length / samples.length >= 0.7) {
    return {
      format: "combined_comma",
      confidence: commaFormat.length / samples.length,
    };
  }
  return null;
};

/**
 * Check for space-separated coordinate format.
 *
 * Detects coordinates in the format "lat lon" (space-separated).
 * Validates that parsed coordinates fall within valid ranges.
 * Requires at least 70% of samples to match the format for positive detection.
 *
 * @param samples - Array of sample values to check
 * @returns Detection result with confidence score, or null if format not detected
 *
 * @example
 * ```typescript
 * checkSpaceFormat(["40.7128 -74.0060", "51.5074 -0.1278"]);
 * // Returns { format: "combined_space", confidence: 1.0 }
 *
 * checkSpaceFormat(["40.7128, -74.0060"]);
 * // Returns null (comma-separated, not space-separated)
 * ```
 */
export const checkSpaceFormat = (samples: unknown[]): FormatDetectionResult | null => {
  const spaceFormat = samples.filter((s) => {
    const spaceRegex = /^(-?\d{1,3}\.?\d{0,10})\s{1,5}(-?\d{1,3}\.?\d{0,10})$/;
    const match = spaceRegex.exec(typeof s === "string" || typeof s === "number" ? String(s) : "");
    if (match?.[1] != null && match?.[1] != undefined && match[2] != null && match[2] != undefined) {
      const lat = Number.parseFloat(match[1]);
      const lon = Number.parseFloat(match[2]);
      return isValidCoordinate(lat, lon);
    }
    return false;
  });

  if (spaceFormat.length / samples.length >= 0.7) {
    return {
      format: "combined_space",
      confidence: spaceFormat.length / samples.length,
    };
  }
  return null;
};

/**
 * Check for GeoJSON Point format.
 *
 * Detects coordinates in GeoJSON Point format:
 * ```json
 * {"type": "Point", "coordinates": [lon, lat]}
 * ```
 *
 * Note: GeoJSON uses [longitude, latitude] order (opposite of typical lat/lon).
 * Validates that parsed coordinates fall within valid ranges.
 * Requires at least 70% of samples to match the format for positive detection.
 *
 * @param samples - Array of sample values to check
 * @returns Detection result with confidence score, or null if format not detected
 *
 * @example
 * ```typescript
 * checkGeoJsonFormat([
 *   '{"type": "Point", "coordinates": [-74.0060, 40.7128]}',
 *   '{"type": "Point", "coordinates": [-0.1278, 51.5074]}'
 * ]);
 * // Returns { format: "geojson", confidence: 1.0 }
 *
 * checkGeoJsonFormat(["40.7128, -74.0060"]);
 * // Returns null (not GeoJSON)
 * ```
 */
export const checkGeoJsonFormat = (samples: unknown[]): FormatDetectionResult | null => {
  const geoJsonFormat = samples.filter((s) => {
    try {
      const parsed: unknown = typeof s == "string" ? JSON.parse(s) : s;
      if (
        parsed != null &&
        parsed != undefined &&
        typeof parsed == "object" &&
        (parsed as Record<string, unknown>).type == "Point" &&
        Array.isArray((parsed as Record<string, unknown>).coordinates)
      ) {
        const coordinates = (parsed as Record<string, unknown>).coordinates as unknown[];
        if (coordinates.length >= 2) {
          const lon = coordinates[0] as number;
          const lat = coordinates[1] as number;
          return isValidCoordinate(lat, lon);
        }
      }
    } catch {
      // Not JSON
    }
    return false;
  });

  if (geoJsonFormat.length / samples.length >= 0.7) {
    return {
      format: "geojson",
      confidence: geoJsonFormat.length / samples.length,
    };
  }
  return null;
};
