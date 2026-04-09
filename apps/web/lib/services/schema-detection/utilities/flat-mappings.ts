/**
 * Flat field mapping utilities.
 *
 * Provides a convenience layer that converts the structured
 * FieldMappingsResult (with confidence scores) to flat string paths.
 *
 * The `FieldMappings` type is derived from the canonical field registry
 * in `@/lib/definitions/field-registry`.
 *
 * @module
 * @category Utilities
 */

import type { FieldPathMappings } from "@/lib/definitions/field-registry";

import type { FieldMappingsResult, FieldStatistics } from "../types";
import { detectFieldMappings, getFieldPatterns } from "./patterns";
import { validateFieldType } from "./validators";

/**
 * Flat field mappings detected or configured for a schema.
 *
 * Derived from the canonical field registry. Uses simple string paths
 * instead of the structured FieldMappingsResult.
 */
export type FieldMappings = FieldPathMappings;

/**
 * Convert a structured FieldMappingsResult to flat FieldMappings.
 */
export const toFlatMappings = (result: FieldMappingsResult): FieldMappings => ({
  titlePath: result.title?.path ?? null,
  descriptionPath: result.description?.path ?? null,
  locationNamePath: result.locationName?.path ?? null,
  timestampPath: result.timestamp?.path ?? null,
  endTimestampPath: null,
  latitudePath: result.geo?.latitude?.path ?? null,
  longitudePath: result.geo?.longitude?.path ?? null,
  locationPath: result.geo?.locationField?.path ?? null,
});

/**
 * Find the best matching field for a given type using combined scoring.
 * Internal helper duplicated from patterns.ts to avoid circular deps.
 */
const findBestLocationField = (
  fieldStats: Record<string, FieldStatistics>,
  patterns: readonly RegExp[],
  fieldType: string
): string | null => {
  let bestPath: string | null = null;
  let bestScore = 0;

  for (const [fieldPath, stats] of Object.entries(fieldStats)) {
    const fieldName = fieldPath.split(".").pop() ?? "";
    const patternIndex = patterns.findIndex((p) => p.test(fieldName));
    if (patternIndex === -1) continue;

    const patternScore = 1 - patternIndex / patterns.length;
    const validationScore = validateFieldType(stats, fieldType);
    if (validationScore === 0) continue;

    const score = patternScore * 0.6 + validationScore * 0.4;
    if (score > bestScore) {
      bestPath = fieldPath;
      bestScore = score;
    }
  }

  return bestPath;
};

/**
 * Detect field mappings and return flat paths.
 *
 * Convenience wrapper that combines detectFieldMappings with toFlatMappings.
 * For the location field, falls back to language-aware pattern detection
 * when geo detection does not find a location field.
 *
 * @param fieldStats - Field statistics from schema builder
 * @param language - ISO 639-3 language code
 * @returns Flat field mappings with string paths
 */
export const detectFlatFieldMappings = (
  fieldStats: Record<string, FieldStatistics>,
  language: string
): FieldMappings => {
  const result = detectFieldMappings(fieldStats, language);
  const flat = toFlatMappings(result);

  // If geo detection didn't find a location field, try language-aware patterns
  flat.locationPath ??= findBestLocationField(fieldStats, getFieldPatterns("location", language), "location");

  return flat;
};
