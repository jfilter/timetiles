/**
 * Pattern detection utilities for schema building.
 *
 * Contains functions for detecting ID fields, geographic coordinates,
 * enumerations, and other data patterns in schema analysis.
 *
 * @module
 * @category Services/SchemaBuilder
 */

import { checkCommaFormat, checkGeoJsonFormat, checkSpaceFormat } from "@/lib/geospatial/detection";
import { parseCoordinate } from "@/lib/geospatial/parsing";
import {
  ADDRESS_PATTERNS,
  COMBINED_COORDINATE_PATTERNS,
  COORDINATE_BOUNDS,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
} from "@/lib/geospatial/patterns";
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

// Helper to check if numeric field is valid coordinate
const isValidNumericCoordinate = (stats: FieldStatistics, bounds: { min: number; max: number }): boolean => {
  const hasNumericType = (stats.typeDistribution["number"] ?? 0) > 0 || (stats.typeDistribution["integer"] ?? 0) > 0;
  return (
    hasNumericType &&
    stats.numericStats !== undefined &&
    stats.numericStats.min >= bounds.min &&
    stats.numericStats.max <= bounds.max
  );
};

// Helper to check if string field contains parseable coordinates
const isValidStringCoordinate = (stats: FieldStatistics, bounds: { min: number; max: number }): boolean => {
  const hasStringType = (stats.typeDistribution["string"] ?? 0) > 0;
  if (!hasStringType || !stats.uniqueSamples || stats.uniqueSamples.length === 0) {
    return false;
  }

  let validParsedCount = 0;
  let totalParsed = 0;

  for (const sample of stats.uniqueSamples.slice(0, 10)) {
    if (typeof sample === "string" && sample.trim() !== "") {
      const parsed = parseCoordinate(sample);
      if (parsed !== null) {
        totalParsed++;
        if (parsed >= bounds.min && parsed <= bounds.max) {
          validParsedCount++;
        }
      }
    }
  }

  // If at least 70% of parsed samples are within bounds, consider it valid
  return totalParsed > 0 && validParsedCount / totalParsed >= 0.7;
};

const isValidCoordinateField = (stats: FieldStatistics, bounds: { min: number; max: number }): boolean => {
  return isValidNumericCoordinate(stats, bounds) || isValidStringCoordinate(stats, bounds);
};

// Calculate pattern match confidence (0.4 points max)
const calculatePatternConfidence = (fieldName: string, patterns: RegExp[]): number => {
  const patternMatch = patterns.findIndex((p) => p.test(fieldName));
  if (patternMatch === -1) return 0;
  // Earlier patterns in the list are more specific, so they get higher scores
  const patternScore = 1 - patternMatch / patterns.length;
  return patternScore * 0.4;
};

// Calculate data type validity confidence (0.3 points max)
const calculateTypeConfidence = (stats: FieldStatistics, bounds: { min: number; max: number }): number => {
  const hasNumericType = (stats.typeDistribution["number"] ?? 0) > 0 || (stats.typeDistribution["integer"] ?? 0) > 0;
  const hasStringType = (stats.typeDistribution["string"] ?? 0) > 0;

  if (hasNumericType && stats.numericStats) {
    const inBounds = stats.numericStats.min >= bounds.min && stats.numericStats.max <= bounds.max;
    return inBounds ? 0.3 : 0;
  }

  if (hasStringType && stats.uniqueSamples) {
    let validCount = 0;
    let totalCount = 0;
    for (const sample of stats.uniqueSamples.slice(0, 10)) {
      if (typeof sample === "string" && sample.trim() !== "") {
        totalCount++;
        const parsed = parseCoordinate(sample);
        if (parsed !== null && parsed >= bounds.min && parsed <= bounds.max) {
          validCount++;
        }
      }
    }
    return totalCount > 0 ? (validCount / totalCount) * 0.3 : 0;
  }

  return 0;
};

/**
 * Calculate confidence score for a coordinate field.
 * Returns a score between 0 and 1 based on multiple factors.
 */
const calculateFieldConfidence = (
  stats: FieldStatistics,
  patterns: RegExp[],
  bounds: { min: number; max: number }
): number => {
  const fieldName = stats.path.split(".").pop() ?? "";

  // Factor 1: Pattern match quality (0.4 points)
  const patternConfidence = calculatePatternConfidence(fieldName, patterns);

  // Factor 2: Data type validity (0.3 points)
  const typeConfidence = calculateTypeConfidence(stats, bounds);

  // Factor 3: Data consistency (0.2 points)
  const totalTypes = Object.values(stats.typeDistribution).reduce((sum, count) => sum + count, 0);
  const dominantType = Math.max(...Object.values(stats.typeDistribution));
  const consistencyRatio = dominantType / totalTypes;
  const consistencyConfidence = consistencyRatio * 0.2;

  // Factor 4: Completeness (0.1 points)
  const completenessRatio = (stats.occurrences - stats.nullCount) / stats.occurrences;
  const completenessConfidence = completenessRatio * 0.1;

  return patternConfidence + typeConfidence + consistencyConfidence + completenessConfidence;
};

const findCoordinateField = (
  fieldStats: Record<string, FieldStatistics>,
  patterns: RegExp[],
  bounds: { min: number; max: number }
): { field: string; confidence: number } | undefined => {
  let bestField: string | undefined;
  let bestConfidence = 0;

  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    if (patterns.some((p) => p.test(fieldName)) && isValidCoordinateField(stats, bounds)) {
      const confidence = calculateFieldConfidence(stats, patterns, bounds);
      if (confidence > bestConfidence) {
        bestField = fieldPath;
        bestConfidence = confidence;
      }
    }
  }

  return bestField ? { field: bestField, confidence: bestConfidence } : undefined;
};

const findLocationField = (fieldStats: Record<string, FieldStatistics>): string | undefined => {
  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    // Check if field name matches address/location patterns
    const matchesPattern = ADDRESS_PATTERNS.some((pattern) => pattern.test(fieldName));
    // Check if field has string type (locations are strings)
    const hasStringType = (stats.typeDistribution["string"] ?? 0) > 0;

    if (matchesPattern && hasStringType) {
      return fieldPath;
    }
  }
  return undefined;
};

const findCombinedCoordinateField = (
  fieldStats: Record<string, FieldStatistics>
): { field: string; format: string; confidence: number } | undefined => {
  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";

    // Check if field name matches combined coordinate patterns
    const matchesPattern = COMBINED_COORDINATE_PATTERNS.some((pattern) => pattern.test(fieldName));

    if (matchesPattern && stats.uniqueSamples && stats.uniqueSamples.length > 0) {
      // Try to detect the format of combined coordinates
      const samples = stats.uniqueSamples.slice(0, 10).filter((s) => s != null && s !== "");

      // Try each format detector
      const formatResult = checkCommaFormat(samples) ?? checkSpaceFormat(samples) ?? checkGeoJsonFormat(samples);

      if (formatResult && formatResult.confidence >= 0.7) {
        return {
          field: fieldPath,
          format: formatResult.format,
          confidence: formatResult.confidence,
        };
      }
    }
  }
  return undefined;
};

/**
 * Detects geographic fields including coordinates and addresses.
 */
export const detectGeoFields = (
  state: SchemaBuilderState
): {
  latitude?: string;
  longitude?: string;
  combinedField?: string;
  combinedFormat?: string;
  locationField?: string;
  confidence: number;
} => {
  // First, try to find separate lat/lon fields
  const latResult = findCoordinateField(state.fieldStats, LATITUDE_PATTERNS, COORDINATE_BOUNDS.latitude);
  const lngResult = findCoordinateField(state.fieldStats, LONGITUDE_PATTERNS, COORDINATE_BOUNDS.longitude);

  // If we found both lat and lon, use them
  if (latResult && lngResult) {
    const locationField = findLocationField(state.fieldStats);
    // Average confidence of both fields
    const confidence = (latResult.confidence + lngResult.confidence) / 2;

    return { latitude: latResult.field, longitude: lngResult.field, locationField, confidence };
  }

  // If we didn't find separate fields, try to find a combined field
  const combinedResult = findCombinedCoordinateField(state.fieldStats);
  if (combinedResult) {
    const locationField = findLocationField(state.fieldStats);
    return {
      combinedField: combinedResult.field,
      combinedFormat: combinedResult.format,
      locationField,
      confidence: combinedResult.confidence,
    };
  }

  // If we found only one coordinate field, still return it with its confidence
  if (latResult ?? lngResult) {
    const locationField = findLocationField(state.fieldStats);
    // Use the confidence of whichever field we found, but halve it since we're missing the other
    const confidence = (latResult?.confidence ?? lngResult?.confidence ?? 0) * 0.5;

    return { latitude: latResult?.field, longitude: lngResult?.field, locationField, confidence };
  }

  // No coordinate fields found, just check for location
  const locationField = findLocationField(state.fieldStats);
  return { locationField, confidence: 0 };
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
