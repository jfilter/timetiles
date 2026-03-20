/* oxlint-disable import/no-cycle -- Constants-only import from patterns.ts; no runtime cycle risk */
/**
 * Coordinate detection utilities.
 *
 * Detects geographic coordinate fields (lat/lng) and combined coordinate
 * fields from field statistics.
 *
 * @module
 * @category Utilities
 */

import type { DetectionOptions, FieldMapping, FieldStatistics, GeoFieldMapping } from "../types";
import {
  ADDRESS_PATTERNS,
  COMBINED_COORDINATE_PATTERNS,
  COORDINATE_BOUNDS,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
} from "./patterns";

/**
 * Parse a coordinate string value.
 */
const parseCoordinate = (value: string): number | null => {
  const trimmed = value.trim();
  const parsed = Number.parseFloat(trimmed);
  return isNaN(parsed) ? null : parsed;
};

/**
 * Check if a field contains valid coordinate values.
 */
// eslint-disable-next-line sonarjs/cognitive-complexity -- Coordinate validation requires checking multiple conditions
const isValidCoordinateField = (stats: FieldStatistics, bounds: { min: number; max: number }): boolean => {
  const hasNumericType = (stats.typeDistribution["number"] ?? 0) > 0 || (stats.typeDistribution["integer"] ?? 0) > 0;

  if (hasNumericType && stats.numericStats) {
    return stats.numericStats.min >= bounds.min && stats.numericStats.max <= bounds.max;
  }

  const hasStringType = (stats.typeDistribution["string"] ?? 0) > 0;
  if (hasStringType && stats.uniqueSamples && stats.uniqueSamples.length > 0) {
    let validCount = 0;
    let totalCount = 0;

    for (const sample of stats.uniqueSamples.slice(0, 10)) {
      if (typeof sample === "string" && sample.trim() !== "") {
        const parsed = parseCoordinate(sample);
        if (parsed !== null) {
          totalCount++;
          if (parsed >= bounds.min && parsed <= bounds.max) {
            validCount++;
          }
        }
      }
    }

    return totalCount > 0 && validCount / totalCount >= 0.7;
  }

  return false;
};

/** Find a coordinate field (latitude or longitude). */
const findCoordinateField = (
  fieldStats: Record<string, FieldStatistics>,
  patterns: RegExp[],
  bounds: { min: number; max: number }
): FieldMapping | null => {
  let bestMatch: FieldMapping | null = null;

  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    const matchIndex = patterns.findIndex((p) => p.test(fieldName));
    if (matchIndex === -1) continue;
    if (!isValidCoordinateField(stats, bounds)) continue;

    const confidence = 0.5 + (1 - matchIndex / patterns.length) * 0.5;
    if (!bestMatch || confidence > bestMatch.confidence) {
      bestMatch = { path: fieldPath, confidence };
    }
  }

  return bestMatch;
};

/** Check if samples contain comma-separated coordinates. */
const checkCommaFormat = (samples: unknown[]): { format: string; confidence: number } | null => {
  let matches = 0;
  let latLngOrder = 0;
  let lngLatOrder = 0;

  for (const sample of samples) {
    if (typeof sample !== "string") continue;
    const parts = sample.split(",").map((p) => Number.parseFloat(p.trim()));
    if (parts.length === 2 && parts.every((p) => !isNaN(p))) {
      matches++;
      const [first, second] = parts as [number, number];
      if (Math.abs(first) <= 90 && Math.abs(second) <= 180) latLngOrder++;
      if (Math.abs(first) <= 180 && Math.abs(second) <= 90) lngLatOrder++;
    }
  }

  if (matches === 0) return null;
  const confidence = matches / samples.length;
  if (confidence < 0.7) return null;

  return { format: latLngOrder >= lngLatOrder ? "lat,lng" : "lng,lat", confidence };
};

/** Find a combined coordinate field. */
const findCombinedCoordinateField = (
  fieldStats: Record<string, FieldStatistics>
): { path: string; format: string; confidence: number } | null => {
  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    if (!COMBINED_COORDINATE_PATTERNS.some((p) => p.test(fieldName))) continue;
    if (!stats.uniqueSamples || stats.uniqueSamples.length === 0) continue;

    const samples = stats.uniqueSamples.slice(0, 10).filter((s) => s != null && s !== "");
    const formatResult = checkCommaFormat(samples);
    if (formatResult && formatResult.confidence >= 0.7) {
      return { path: fieldPath, format: formatResult.format, confidence: formatResult.confidence };
    }
  }
  return null;
};

/** Find an address/location field for geocoding. */
const findLocationField = (
  fieldStats: Record<string, FieldStatistics>,
  effectiveAddressPatterns: RegExp[]
): FieldMapping | null => {
  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    const matchesPattern = effectiveAddressPatterns.some((pattern) => pattern.test(fieldName));
    const hasStringType = (stats.typeDistribution["string"] ?? 0) > 0;
    if (matchesPattern && hasStringType) {
      const patternIndex = effectiveAddressPatterns.findIndex((p) => p.test(fieldName));
      const confidence = 0.5 + (1 - patternIndex / effectiveAddressPatterns.length) * 0.5;
      return { path: fieldPath, confidence };
    }
  }
  return null;
};

/** Build an effective pattern list: merge custom patterns with defaults, or replace them. */
const buildEffectivePatterns = (defaults: readonly RegExp[], custom?: RegExp[], replace?: boolean): RegExp[] => {
  if (!custom) return [...defaults];
  return replace ? [...custom] : [...custom, ...defaults];
};

/** Build effective geo options from DetectionOptions. */
const buildGeoConfig = (options?: DetectionOptions) => ({
  latPatterns: buildEffectivePatterns(LATITUDE_PATTERNS, options?.latitudePatterns, options?.replaceCoordinatePatterns),
  lngPatterns: buildEffectivePatterns(
    LONGITUDE_PATTERNS,
    options?.longitudePatterns,
    options?.replaceCoordinatePatterns
  ),
  addrPatterns: buildEffectivePatterns(ADDRESS_PATTERNS, options?.addressPatterns, options?.replaceAddressPatterns),
  bounds: {
    latitude: options?.coordinateBounds?.latitude ?? COORDINATE_BOUNDS.latitude,
    longitude: options?.coordinateBounds?.longitude ?? COORDINATE_BOUNDS.longitude,
  },
});

/** Build a GeoFieldMapping result from detected fields. */
const buildGeoResult = (
  latitude: FieldMapping | null,
  longitude: FieldMapping | null,
  locationField: FieldMapping | undefined,
  fieldStats: Record<string, FieldStatistics>
): GeoFieldMapping | null => {
  if (latitude && longitude) {
    const avgConfidence = (latitude.confidence + longitude.confidence) / 2;
    return { type: "separate", confidence: avgConfidence, latitude, longitude, locationField };
  }

  const combined = findCombinedCoordinateField(fieldStats);
  if (combined) {
    return {
      type: "combined",
      confidence: combined.confidence,
      combined: { path: combined.path, format: combined.format },
      locationField,
    };
  }

  if (latitude ?? longitude) {
    const field = latitude ?? longitude;
    return {
      type: "separate",
      confidence: (field?.confidence ?? 0) * 0.5,
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      locationField,
    };
  }

  if (locationField) {
    return { type: "separate", confidence: locationField.confidence * 0.3, locationField };
  }

  return null;
};

/** Detect geo field mappings. */
export const detectGeoFields = (
  fieldStats: Record<string, FieldStatistics>,
  options?: DetectionOptions
): GeoFieldMapping | null => {
  if (options?.skip?.coordinates) return null;

  const config = buildGeoConfig(options);
  const latitude = findCoordinateField(fieldStats, config.latPatterns, config.bounds.latitude);
  const longitude = findCoordinateField(fieldStats, config.lngPatterns, config.bounds.longitude);
  const locationField = findLocationField(fieldStats, config.addrPatterns) ?? undefined;

  return buildGeoResult(latitude, longitude, locationField, fieldStats);
};
