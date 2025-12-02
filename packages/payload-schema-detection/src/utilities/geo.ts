/**
 * Structural pattern detection utilities.
 *
 * Provides detection of ID fields and enumeration fields
 * based on data characteristics (not column names).
 *
 * @module
 * @category Utilities
 */

import type { FieldStatistics, PatternResult } from "../types";

/**
 * ID field name patterns.
 */
const ID_PATTERNS = [/^id$/i, /_id$/i, /^uuid$/i, /^guid$/i, /^key$/i, /_key$/i];

/**
 * Detects potential ID fields based on naming patterns and characteristics.
 */
export const detectIdFields = (fieldStats: Record<string, FieldStatistics>): string[] => {
  const idFields: string[] = [];

  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";

    // Check naming patterns
    const matchesPattern = ID_PATTERNS.some((pattern) => pattern.test(fieldName));

    // Check characteristics: unique values and appropriate type
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

/**
 * Detects enumeration fields based on low cardinality.
 */
export const detectEnumFields = (
  fieldStats: Record<string, FieldStatistics>,
  config: { enumThreshold?: number; enumMode?: "count" | "percentage" } = {}
): string[] => {
  const { enumThreshold = 50, enumMode = "count" } = config;
  const enumFields: string[] = [];

  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const hasStringType = (stats.typeDistribution["string"] ?? 0) > 0;

    if (hasStringType && stats.uniqueSamples) {
      const shouldBeEnum =
        enumMode === "count"
          ? stats.uniqueValues <= enumThreshold
          : stats.uniqueValues / stats.occurrences <= enumThreshold / 100;

      if (shouldBeEnum && stats.uniqueValues > 1 && stats.uniqueValues < stats.occurrences) {
        enumFields.push(fieldPath);
      }
    }
  }

  return enumFields;
};

/**
 * Detect all structural patterns in field statistics.
 */
export const detectPatterns = (
  fieldStats: Record<string, FieldStatistics>,
  config?: { enumThreshold?: number; enumMode?: "count" | "percentage" }
): PatternResult => {
  return {
    idFields: detectIdFields(fieldStats),
    enumFields: detectEnumFields(fieldStats, config),
  };
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
