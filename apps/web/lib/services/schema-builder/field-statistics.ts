/**
 * Field statistics tracking for schema building.
 *
 * Contains functions for tracking and updating field-level statistics
 * during schema analysis including types, ranges, unique values, etc..
 *
 * @module
 * @category Services/SchemaBuilder
 */

import type { FieldStatistics } from "@/lib/types/schema-detection";
import { isImportDateLike } from "@/lib/utils/date-parsing";
import { classifyNumericFormat } from "@/lib/utils/number-parsing";

const updateTypeDistribution = (stats: FieldStatistics, valueType: string): void => {
  if (!stats.typeDistribution) {
    stats.typeDistribution = {};
  }
  stats.typeDistribution[valueType] = (stats.typeDistribution[valueType] ?? 0) + 1;
};

const updateNumericStats = (stats: FieldStatistics, value: number): void => {
  if (stats.numericStats) {
    // Divide by the running count of NUMERIC values, not stats.occurrences
    // (which is bumped for every value including nulls/non-numeric strings),
    // otherwise the mean is diluted on mixed columns.
    const count = (stats.numericStats.count ?? 0) + 1;
    stats.numericStats.min = Math.min(stats.numericStats.min, value);
    stats.numericStats.max = Math.max(stats.numericStats.max, value);
    stats.numericStats.avg = (stats.numericStats.avg * (count - 1) + value) / count;
    stats.numericStats.isInteger = stats.numericStats.isInteger && Number.isInteger(value);
    stats.numericStats.count = count;
  } else {
    stats.numericStats = { min: value, max: value, avg: value, isInteger: Number.isInteger(value), count: 1 };
  }
};

const trackUniqueSamples = (stats: FieldStatistics, value: unknown, maxUniqueValues: number): void => {
  // Convert value to storable type (Date -> ISO string, arrays kept as-is)
  let sampleValue: string | number | boolean | null | Record<string, unknown> | undefined;
  if (value instanceof Date) {
    sampleValue = value.toISOString();
  } else if (Array.isArray(value)) {
    if (stats.uniqueSamples.length >= maxUniqueValues) {
      return;
    }
    // Store array samples for tag field detection (serialized for dedup)
    const key = JSON.stringify(value);
    if (!stats.uniqueSamples.some((s) => JSON.stringify(s) === key)) {
      stats.uniqueSamples.push(value as unknown as Record<string, unknown>);
      stats.uniqueValues = stats.uniqueSamples.length;
    }
    return;
  } else if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    sampleValue = value;
  }

  if (sampleValue === undefined) {
    return;
  }

  const isTracked = stats.uniqueSamples.includes(sampleValue);
  if (!isTracked) {
    if (stats.uniqueSamples.length >= maxUniqueValues) {
      return;
    }
    stats.uniqueSamples.push(sampleValue);
  }

  // Count real frequencies for tracked scalars — `uniqueSamples` is deduped,
  // so enum detection needs this map for accurate counts. Repeats of already-
  // tracked values are counted even after the sample cap is reached.
  stats.valueCounts ??= {};
  const countKey = JSON.stringify(sampleValue);
  stats.valueCounts[countKey] = (stats.valueCounts[countKey] ?? 0) + 1;
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
  // Numeric string detection — locale-aware (US and EU separators) via
  // classifyNumericFormat so "1.234,56" counts toward formats.numeric too, not
  // only US-style "1234.56". This is what revives string-numeric columns into
  // dataset.fieldTypes.number for the numeric range filter.
  if (classifyNumericFormat(value) !== null) {
    stats.formats.numeric = (stats.formats.numeric ?? 0) + 1;
  }
};

/**
 * Updates field statistics with a new value.
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
  if (typeof value === "number" && !Number.isNaN(value)) {
    updateNumericStats(stats, value);
  }

  // Track unique samples
  trackUniqueSamples(stats, value, maxUniqueValues);

  // Track formats for strings and array elements
  if (typeof value === "string") {
    detectStringFormats(value, stats);
  } else if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string") {
        detectStringFormats(item, stats);
      }
    }
  }

  // Update unique count
  stats.uniqueValues = stats.uniqueSamples.length;

  // Update last seen
  stats.lastSeen = new Date();
};

/**
 * Creates initial field statistics.
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
 * Gets the type of a value as a string.
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
 * Checks if a string looks like a date.
 */
const isDateString = (value: string): boolean => {
  return isImportDateLike(value);
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
  incoming: FieldStatistics["numericStats"]
): FieldStatistics["numericStats"] => {
  if (!existing || !incoming) return existing ?? incoming;

  // Weight the combined mean by each side's NUMERIC count, not total
  // occurrences (which include nulls/non-numeric values).
  const existingCount = existing.count ?? 0;
  const incomingCount = incoming.count ?? 0;
  const count = existingCount + incomingCount;

  return {
    min: Math.min(existing.min, incoming.min),
    max: Math.max(existing.max, incoming.max),
    avg:
      count === 0
        ? (existing.avg + incoming.avg) / 2
        : (existing.avg * existingCount + incoming.avg * incomingCount) / count,
    isInteger: existing.isInteger && incoming.isInteger,
    count,
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
 * Merges field statistics when combining batches.
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

  // Merge numeric stats (weighted by each side's numeric count internally)
  merged.numericStats = mergeNumericStats(existing.numericStats, incoming.numericStats);

  // Merge unique samples
  const allSamples = [...existing.uniqueSamples, ...incoming.uniqueSamples];
  const uniqueSamplesSet = new Set(allSamples);
  merged.uniqueSamples = Array.from(uniqueSamplesSet).slice(0, 100); // Keep max 100 samples
  merged.uniqueValues = uniqueSamplesSet.size;

  // Merge enum values
  merged.enumValues = mergeEnumValues(existing.enumValues, incoming.enumValues, merged.occurrences);

  // Merge per-value frequencies (see trackUniqueSamples)
  if (existing.valueCounts || incoming.valueCounts) {
    const valueCounts: Record<string, number> = { ...existing.valueCounts };
    for (const [key, count] of Object.entries(incoming.valueCounts ?? {})) {
      valueCounts[key] = (valueCounts[key] ?? 0) + count;
    }
    merged.valueCounts = valueCounts;
  }

  return merged;
};
