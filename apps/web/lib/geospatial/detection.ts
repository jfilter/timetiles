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

/** Minimum ratio of matching samples required for positive format detection. */
const DETECTION_CONFIDENCE_THRESHOLD = 0.7;

/**
 * Type guard for GeoJSON Point objects.
 */
interface GeoJsonPoint {
  type: "Point";
  coordinates: number[];
}

const isGeoJsonPoint = (value: unknown): value is GeoJsonPoint =>
  value != null &&
  typeof value === "object" &&
  (value as Record<string, unknown>).type === "Point" &&
  Array.isArray((value as Record<string, unknown>).coordinates);

/**
 * Generic format detection using a matcher function.
 *
 * Filters samples through the matcher, computes the match ratio,
 * and returns a detection result if it meets the confidence threshold.
 */
const detectFormat = (
  samples: unknown[],
  matcher: (sample: unknown) => boolean,
  format: string
): FormatDetectionResult | null => {
  const matches = samples.filter(matcher);
  const confidence = matches.length / samples.length;
  if (confidence >= DETECTION_CONFIDENCE_THRESHOLD) {
    return { format, confidence };
  }
  return null;
};

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
  return detectFormat(
    samples,
    (s) => {
      const commaRegex = /^(-?\d{1,3}\.?\d{0,10}),\s{0,5}(-?\d{1,3}\.?\d{0,10})$/;
      const match = commaRegex.exec(typeof s === "string" || typeof s === "number" ? String(s) : "");
      if (match?.[1] != null && match[2] != null) {
        return isValidCoordinate(Number.parseFloat(match[1]), Number.parseFloat(match[2]));
      }
      return false;
    },
    "combined_comma"
  );
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
  return detectFormat(
    samples,
    (s) => {
      const spaceRegex = /^(-?\d{1,3}\.?\d{0,10})\s{1,5}(-?\d{1,3}\.?\d{0,10})$/;
      const match = spaceRegex.exec(typeof s === "string" || typeof s === "number" ? String(s) : "");
      if (match?.[1] != null && match[2] != null) {
        return isValidCoordinate(Number.parseFloat(match[1]), Number.parseFloat(match[2]));
      }
      return false;
    },
    "combined_space"
  );
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
  return detectFormat(
    samples,
    (s) => {
      try {
        const parsed: unknown = typeof s === "string" ? JSON.parse(s) : s;
        if (isGeoJsonPoint(parsed) && parsed.coordinates.length >= 2) {
          const lon = parsed.coordinates[0]!;
          const lat = parsed.coordinates[1]!;
          return isValidCoordinate(lat, lon);
        }
      } catch {
        // Not JSON
      }
      return false;
    },
    "geojson"
  );
};
