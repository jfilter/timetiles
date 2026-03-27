/**
 * Structural pattern detection utilities.
 *
 * Provides detection of ID fields and enumeration fields
 * based on data characteristics (not column names).
 *
 * @module
 * @category Utilities
 */

import type { DetectionOptions, FieldStatistics, PatternResult } from "../types";

/**
 * ID field name patterns.
 */
const ID_PATTERNS = [/^id$/i, /_id$/i, /^uuid$/i, /^guid$/i, /^key$/i, /_key$/i];

/**
 * Detects potential ID fields based on naming patterns and characteristics.
 */
export const detectIdFields = (fieldStats: Record<string, FieldStatistics>, options?: DetectionOptions): string[] => {
  if (options?.skip?.ids) return [];

  // Build effective ID patterns
  let effectivePatterns = ID_PATTERNS;
  if (options?.idPatterns) {
    effectivePatterns = options.replaceIdPatterns ? [...options.idPatterns] : [...options.idPatterns, ...ID_PATTERNS];
  }

  const idFields: string[] = [];

  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";

    // Check naming patterns
    const matchesPattern = effectivePatterns.some((pattern) => pattern.test(fieldName));

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
  config: { enumThreshold?: number; enumMode?: "count" | "percentage" } | DetectionOptions = {}
): string[] => {
  if ("skip" in config && config.skip?.enums) return [];

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
  config?: { enumThreshold?: number; enumMode?: "count" | "percentage" },
  options?: DetectionOptions
): PatternResult => {
  // When options are provided, merge their enum settings with config
  const enumConfig: DetectionOptions | { enumThreshold?: number; enumMode?: "count" | "percentage" } | undefined =
    options
      ? {
          ...options,
          enumThreshold: options.enumThreshold ?? config?.enumThreshold,
          enumMode: options.enumMode ?? config?.enumMode,
        }
      : config;

  return { idFields: detectIdFields(fieldStats, options), enumFields: detectEnumFields(fieldStats, enumConfig) };
};

/**
 * Detects enumeration fields and mutates field statistics in place.
 *
 * Sets `stats.isEnumCandidate` and `stats.enumValues` directly on the
 * provided field stats. This is used by the schema builder after all
 * batches are processed.
 */
export const enrichEnumFields = (
  fieldStats: Record<string, FieldStatistics>,
  config: { enumThreshold: number; enumMode: "count" | "percentage" }
): void => {
  for (const stats of Object.values(fieldStats)) {
    if ((stats.typeDistribution["array"] ?? 0) > 0) {
      enrichTagField(stats, config.enumThreshold);
    }
    if ((stats.typeDistribution["string"] ?? 0) > 0 && !stats.isEnumCandidate) {
      enrichScalarEnumField(stats, config);
    }
  }
};

/** Detect tag fields (multi-value arrays) by counting unique elements across samples. */
const enrichTagField = (stats: FieldStatistics, _enumThreshold: number): void => {
  if (!stats.uniqueSamples) return;

  const elementCounts = new Map<string, number>();
  for (const sample of stats.uniqueSamples) {
    const arr = Array.isArray(sample) ? sample : tryParseJsonStringArray(sample);
    if (!arr) continue;
    for (const item of arr) {
      if (item != null && item !== "") {
        elementCounts.set(String(item), (elementCounts.get(String(item)) ?? 0) + 1);
      }
    }
  }

  // Skip if most values are URLs — those are link arrays, not tags
  if ((stats.formats.url ?? 0) > stats.occurrences * 0.5) return;

  // Tags naturally have higher cardinality than scalar enums — allow up to 200 unique elements
  const maxCardinality = 200;
  if (elementCounts.size > 1 && elementCounts.size <= maxCardinality) {
    stats.isTagField = true;
    stats.isEnumCandidate = true;
    stats.enumValues = Array.from(elementCounts.entries()).map(([value, count]) => ({
      value,
      count,
      percent: (count / stats.occurrences) * 100,
    }));
  }
};

/** Detect scalar enum fields (low-cardinality strings). */
const enrichScalarEnumField = (
  stats: FieldStatistics,
  config: { enumThreshold: number; enumMode: "count" | "percentage" }
): void => {
  if (!stats.uniqueSamples) return;

  const shouldBeEnum =
    config.enumMode === "count"
      ? stats.uniqueValues <= config.enumThreshold
      : stats.uniqueValues / stats.occurrences <= config.enumThreshold / 100;

  if (shouldBeEnum && stats.uniqueValues > 1 && stats.uniqueValues < stats.occurrences) {
    stats.isEnumCandidate = true;
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
};

/** Try to parse a JSON-stringified array from a string value. */
const tryParseJsonStringArray = (value: unknown): unknown[] | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("[")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
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
