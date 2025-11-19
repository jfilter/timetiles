/**
 * Provides utilities for detecting the format of geographic data within a dataset.
 *
 * This module contains functions and regular expressions designed to identify how location
 * data is represented. It can detect:
 * - Combined coordinate formats (e.g., "lat, lon", "lat lon", GeoJSON).
 * - Individual latitude and longitude columns based on common naming conventions.
 *
 * The results of this detection are used to guide the parsing and validation process
 * during data import, ensuring that geographic information is correctly interpreted.
 *
 * @module
 */

/**
 * Format detection utilities for geolocation data.
 */

import { isValidCoordinate } from "@/lib/geospatial";

export interface FormatDetectionResult {
  format: string;
  confidence: number;
}

/**
 * Check for comma-separated coordinate format.
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

/**
 * Pattern matching for latitude columns.
 */
export const latitudePatterns = [
  /^lat(itude)?$/i,
  /^lat[_\s-]?deg(rees)?$/i,
  /^y[_\s-]?coord(inate)?$/i,
  /^location[_\s-]?lat(itude)?$/i,
  /^geo[_\s-]?lat(itude)?$/i,
  /^decimal[_\s-]?lat(itude)?$/i,
  /^latitude[_\s-]?decimal$/i,
  /^wgs84[_\s-]?lat(itude)?$/i,
];

/**
 * Pattern matching for longitude columns.
 */
export const longitudePatterns = [
  /^lon(g|gitude)?$/i,
  /^lng$/i,
  /^lon[_\s-]?deg(rees)?$/i,
  /^long[_\s-]?deg(rees)?$/i,
  /^x[_\s-]?coord(inate)?$/i,
  /^location[_\s-]?lon(g|gitude)?$/i,
  /^geo[_\s-]?lon(g|gitude)?$/i,
  /^decimal[_\s-]?lon(g|gitude)?$/i,
  /^longitude[_\s-]?decimal$/i,
  /^wgs84[_\s-]?lon(g|gitude)?$/i,
];

/**
 * Combined coordinate patterns.
 */
export const combinedPatterns = [
  /^coord(inate)?s$/i,
  /^lat[_\s-]?lon(g)?$/i,
  /^location$/i,
  /^geo[_\s-]?location$/i,
  /^position$/i,
  /^point$/i,
  /^geometry$/i,
  /^coordinates$/i,
];
