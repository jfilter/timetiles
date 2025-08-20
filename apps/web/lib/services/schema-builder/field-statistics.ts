/**
 * Field statistics tracking for schema building.
 *
 * Contains functions for tracking and updating field-level statistics
 * during schema analysis including types, ranges, unique values, etc.
 *
 * @module
 * @category Services/SchemaBuilder
 */

import type { FieldStatistics } from "@/lib/types/schema-detection";

const updateTypeDistribution = (stats: FieldStatistics, valueType: string): void => {
  if (!stats.typeDistribution) {
    stats.typeDistribution = {};
  }
  stats.typeDistribution[valueType] = (stats.typeDistribution[valueType] ?? 0) + 1;
};

const updateNumericStats = (stats: FieldStatistics, value: number, occurrences: number): void => {
  if (!stats.numericStats) {
    stats.numericStats = {
      min: value,
      max: value,
      avg: value,
      isInteger: Number.isInteger(value),
    };
  } else {
    stats.numericStats.min = Math.min(stats.numericStats.min, value);
    stats.numericStats.max = Math.max(stats.numericStats.max, value);
    // Update average (simplified)
    stats.numericStats.avg = (stats.numericStats.avg * (occurrences - 1) + value) / occurrences;
    stats.numericStats.isInteger = stats.numericStats.isInteger && Number.isInteger(value);
  }
};

const trackUniqueSamples = (stats: FieldStatistics, value: unknown, maxUniqueValues: number): void => {
  if (
    stats.uniqueSamples.length < maxUniqueValues &&
    (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) &&
    !stats.uniqueSamples.includes(value)
  ) {
    stats.uniqueSamples.push(value);
  }
};

const detectEmailFormat = (value: string, stats: FieldStatistics): void => {
  // Email detection - simplified to avoid backtracking
  // Basic check: contains @ with text before and after, and a dot after @
  if (value.includes("@") && value.indexOf("@") > 0 && value.indexOf("@") < value.length - 1) {
    const parts = value.split("@");
    if (parts.length === 2 && parts[1]?.includes(".") && !value.includes(" ")) {
      stats.formats.email = (stats.formats.email ?? 0) + 1;
    }
  }
};

const detectStringFormats = (value: string, stats: FieldStatistics): void => {
  detectEmailFormat(value, stats);

  // URL detection
  if (/^https?:\/\/[^\s]+/.test(value)) {
    stats.formats.url = (stats.formats.url ?? 0) + 1;
  }
  // Date-time detection
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
    stats.formats.dateTime = (stats.formats.dateTime ?? 0) + 1;
  }
  // Date detection
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    stats.formats.date = (stats.formats.date ?? 0) + 1;
  }
  // Numeric string detection
  // eslint-disable-next-line security/detect-unsafe-regex -- Simple numeric pattern, false positive
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    stats.formats.numeric = (stats.formats.numeric ?? 0) + 1;
  }
};

/**
 * Updates field statistics with a new value
 */
export const updateFieldStats = (stats: FieldStatistics, value: unknown, maxUniqueValues: number): void => {
  stats.occurrences++;

  // Track null values
  if (value === null || value === undefined) {
    stats.nullCount++;
  }

  const valueType = getValueType(value);
  updateTypeDistribution(stats, valueType);

  // Track numeric stats
  if (typeof value === "number" && !isNaN(value)) {
    updateNumericStats(stats, value, stats.occurrences);
  }

  // Track unique samples
  trackUniqueSamples(stats, value, maxUniqueValues);

  // Track formats for strings
  if (typeof value === "string") {
    detectStringFormats(value, stats);
  }

  // Update unique count
  stats.uniqueValues = stats.uniqueSamples.length;

  // Update last seen
  stats.lastSeen = new Date();
};

/**
 * Creates initial field statistics
 */
export const createFieldStats = (path: string = ""): FieldStatistics => ({
  path,
  occurrences: 0,
  occurrencePercent: 0,
  nullCount: 0,
  uniqueValues: 0,
  uniqueSamples: [],
  typeDistribution: {},
  formats: {},
  isEnumCandidate: false,
  firstSeen: new Date(),
  lastSeen: new Date(),
  depth: path.split(".").length - 1,
});

/**
 * Gets the type of a value as a string
 */
export const getValueType = (value: unknown): string => {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (Array.isArray(value)) return "array";

  const type = typeof value;

  if (type === "number") {
    if (Number.isInteger(value)) return "integer";
    return "number";
  }

  if (type === "string" && typeof value === "string") {
    // Check for date strings
    if (isDateString(value)) return "date";
    // Check for boolean strings
    if (value === "true" || value === "false") return "boolean-string";
    return "string";
  }

  return type;
};

/**
 * Checks if a string looks like a date
 */
const isDateString = (value: string): boolean => {
  // ISO date pattern
  // eslint-disable-next-line security/detect-unsafe-regex -- Simple date pattern, false positive
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?$/.test(value)) {
    const date = new Date(value);
    return !isNaN(date.getTime());
  }

  // Common date formats
  return /^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value);
};

const mergeDistributions = <T extends Record<string, number>>(existing: T, incoming: T): T => {
  const result = {} as T;
  for (const [key, count] of Object.entries(existing)) {
    result[key as keyof T] = ((result[key as keyof T] ?? 0) + count) as T[keyof T];
  }
  for (const [key, count] of Object.entries(incoming)) {
    result[key as keyof T] = ((result[key as keyof T] ?? 0) + count) as T[keyof T];
  }
  return result;
};

const mergeNumericStats = (
  existing: FieldStatistics["numericStats"],
  incoming: FieldStatistics["numericStats"],
  existingOccurrences: number,
  incomingOccurrences: number,
  totalOccurrences: number
): FieldStatistics["numericStats"] => {
  if (!existing || !incoming) return existing ?? incoming;

  return {
    min: Math.min(existing.min, incoming.min),
    max: Math.max(existing.max, incoming.max),
    avg: (existing.avg * existingOccurrences + incoming.avg * incomingOccurrences) / totalOccurrences,
    isInteger: existing.isInteger && incoming.isInteger,
  };
};

const mergeEnumValues = (
  existing: FieldStatistics["enumValues"],
  incoming: FieldStatistics["enumValues"],
  totalOccurrences: number
): FieldStatistics["enumValues"] => {
  if (!existing && !incoming) return undefined;

  const enumMap = new Map<unknown, number>();

  for (const item of existing ?? []) {
    enumMap.set(item.value, (enumMap.get(item.value) ?? 0) + item.count);
  }
  for (const item of incoming ?? []) {
    enumMap.set(item.value, (enumMap.get(item.value) ?? 0) + item.count);
  }

  return Array.from(enumMap.entries()).map(([value, count]) => ({
    value,
    count,
    percent: (count / totalOccurrences) * 100,
  }));
};

/**
 * Merges field statistics when combining batches
 */
export const mergeFieldStats = (existing: FieldStatistics, incoming: FieldStatistics): FieldStatistics => {
  const merged: FieldStatistics = {
    path: existing.path,
    occurrences: existing.occurrences + incoming.occurrences,
    occurrencePercent: 0, // Will be recalculated
    nullCount: existing.nullCount + incoming.nullCount,
    uniqueValues: 0, // Will be recalculated
    uniqueSamples: [],
    typeDistribution: mergeDistributions(existing.typeDistribution, incoming.typeDistribution),
    formats: mergeDistributions(existing.formats, incoming.formats),
    isEnumCandidate: existing.isEnumCandidate || incoming.isEnumCandidate,
    firstSeen: existing.firstSeen < incoming.firstSeen ? existing.firstSeen : incoming.firstSeen,
    lastSeen: existing.lastSeen > incoming.lastSeen ? existing.lastSeen : incoming.lastSeen,
    depth: existing.depth,
  };

  // Merge numeric stats
  merged.numericStats = mergeNumericStats(
    existing.numericStats,
    incoming.numericStats,
    existing.occurrences,
    incoming.occurrences,
    merged.occurrences
  );

  // Merge unique samples
  const allSamples = [...existing.uniqueSamples, ...incoming.uniqueSamples];
  const uniqueSamplesSet = new Set(allSamples);
  merged.uniqueSamples = Array.from(uniqueSamplesSet).slice(0, 100); // Keep max 100 samples
  merged.uniqueValues = uniqueSamplesSet.size;

  // Merge enum values
  merged.enumValues = mergeEnumValues(existing.enumValues, incoming.enumValues, merged.occurrences);

  return merged;
};
