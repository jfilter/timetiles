/**
 * Pattern detection utilities for schema building.
 *
 * Contains functions for detecting ID fields, geographic coordinates,
 * enumerations, and other data patterns in schema analysis.
 *
 * @module
 * @category Services/SchemaBuilder
 */

import type { FieldStatistics, SchemaBuilderState } from "@/lib/types/schema-detection";

/**
 * Detects potential ID fields based on naming patterns and characteristics.
 */
export const detectIdFields = (state: SchemaBuilderState): string[] => {
  const idFields: string[] = [];
  const idPatterns = [/^id$/i, /_id$/i, /^uuid$/i, /^guid$/i, /^key$/i, /_key$/i];

  for (const [fieldPath, stats] of Object.entries(state.fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";

    // Check naming patterns
    const matchesPattern = idPatterns.some((pattern) => pattern.test(fieldName));

    // Check characteristics
    const hasIdCharacteristics =
      stats.uniqueValues === stats.occurrences &&
      stats.occurrences > 1 &&
      ((stats.typeDistribution["string"] ?? 0) > 0 ||
        (stats.typeDistribution["number"] ?? 0) > 0 ||
        (stats.typeDistribution["integer"] ?? 0) > 0);

    if (matchesPattern || hasIdCharacteristics) {
      idFields.push(fieldPath);
    }
  }

  return idFields;
};

const COORDINATE_PATTERNS = {
  latitude: [/^lat(itude)?$/i, /^location[._]?lat(itude)?$/i, /^geo[._]?lat(itude)?$/i],
  longitude: [/^(lng|lon)(gitude)?$/i, /^location[._]?(lng|lon)(gitude)?$/i, /^geo[._]?(lng|lon)(gitude)?$/i],
};

const COORDINATE_BOUNDS = {
  latitude: { min: -90, max: 90 },
  longitude: { min: -180, max: 180 },
};

const isValidCoordinateField = (stats: FieldStatistics, bounds: { min: number; max: number }): boolean => {
  const hasNumericType = (stats.typeDistribution["number"] ?? 0) > 0 || (stats.typeDistribution["integer"] ?? 0) > 0;
  return (
    hasNumericType &&
    stats.numericStats !== undefined &&
    stats.numericStats.min >= bounds.min &&
    stats.numericStats.max <= bounds.max
  );
};

const findCoordinateField = (
  fieldStats: Record<string, FieldStatistics>,
  patterns: RegExp[],
  bounds: { min: number; max: number }
): string | undefined => {
  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    if (patterns.some((p) => p.test(fieldName)) && isValidCoordinateField(stats, bounds)) {
      return fieldPath;
    }
  }
  return undefined;
};

/**
 * Detects geographic coordinate fields.
 */
export const detectGeoFields = (
  state: SchemaBuilderState
): {
  latitude?: string;
  longitude?: string;
  confidence: number;
} => {
  const latField = findCoordinateField(state.fieldStats, COORDINATE_PATTERNS.latitude, COORDINATE_BOUNDS.latitude);
  const lngField = findCoordinateField(state.fieldStats, COORDINATE_PATTERNS.longitude, COORDINATE_BOUNDS.longitude);

  const confidence = (latField ? 0.5 : 0) + (lngField ? 0.5 : 0);

  return { latitude: latField, longitude: lngField, confidence };
};

/**
 * Detects enumeration fields based on unique value ratios.
 */
export const detectEnums = (
  state: SchemaBuilderState,
  config: { enumThreshold: number; enumMode: "count" | "percentage" }
): void => {
  for (const stats of Object.values(state.fieldStats)) {
    const hasStringType = (stats.typeDistribution["string"] ?? 0) > 0;
    if (hasStringType && stats.uniqueSamples) {
      const shouldBeEnum =
        config.enumMode === "count"
          ? stats.uniqueValues <= config.enumThreshold
          : stats.uniqueValues / stats.occurrences <= config.enumThreshold / 100;

      if (shouldBeEnum && stats.uniqueValues > 1 && stats.uniqueValues < stats.occurrences) {
        stats.isEnumCandidate = true;
        // Create enum values from unique samples
        const valueCounts = new Map<unknown, number>();
        for (const sample of stats.uniqueSamples) {
          valueCounts.set(sample, (valueCounts.get(sample) ?? 0) + 1);
        }
        stats.enumValues = Array.from(valueCounts.entries()).map(([value, count]) => ({
          value,
          count,
          percent: (count / stats.occurrences) * 100,
        }));
      }
    }
  }
};

/**
 * Checks if a value looks like an ID.
 */
export const looksLikeId = (value: unknown): boolean => {
  if (typeof value === "string") {
    // UUID pattern
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      return true;
    }
    // MongoDB ObjectId pattern
    if (/^[0-9a-f]{24}$/i.test(value)) {
      return true;
    }
    // Generic alphanumeric ID
    if (/^[a-zA-Z0-9]{8,}$/.test(value)) {
      return true;
    }
  } else if (typeof value === "number") {
    // Large integers often used as IDs
    return value > 1000000;
  }
  return false;
};

/**
 * Checks if a value looks like a geographic coordinate.
 */
export const looksLikeCoordinate = (value: unknown, type: "lat" | "lng"): boolean => {
  if (typeof value !== "number") return false;

  if (type === "lat") {
    return value >= -90 && value <= 90;
  } else {
    return value >= -180 && value <= 180;
  }
};
