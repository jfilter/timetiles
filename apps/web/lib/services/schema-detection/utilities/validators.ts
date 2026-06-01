/**
 * Statistical field validators for schema detection.
 *
 * Provides validation functions that score how well a field's
 * statistics match a given field type (title, description, timestamp,
 * end timestamp, location). Used by the pattern matching logic to combine
 * name-based matching with data-driven confidence.
 *
 * @module
 * @category Utilities
 */

import { isImportDateLike, isValidDate } from "@/lib/utils/date-parsing";

import type { FieldStatistics, ValidatorConfig } from "../types";

// ---------------------------------------------------------------------------
// Individual field type validators
// ---------------------------------------------------------------------------

/**
 * Validates field as a title field.
 * Should be mostly strings with reasonable length and high coverage.
 */
const validateTitleField = (stats: FieldStatistics, stringPct: number, minStringPct?: number): number => {
  if (stringPct < (minStringPct ?? 0.8)) return 0;

  if (stats.uniqueSamples && stats.uniqueSamples.length > 0) {
    const stringValues = stats.uniqueSamples.filter((v): v is string => typeof v === "string");
    if (stringValues.length === 0) return 0;

    const avgLength = stringValues.reduce((sum, s) => sum + s.length, 0) / stringValues.length;

    if (avgLength >= 10 && avgLength <= 100) return 1;
    if (avgLength >= 5 && avgLength <= 200) return 0.8;
    if (avgLength < 3 || avgLength > 500) return 0.3;
    return 0.6;
  }

  return 0.5;
};

/**
 * Validates field as a description field.
 * Should be mostly strings, typically longer than titles.
 */
const validateDescriptionField = (stats: FieldStatistics, stringPct: number, minStringPct?: number): number => {
  if (stringPct < (minStringPct ?? 0.7)) return 0;

  if (stats.uniqueSamples && stats.uniqueSamples.length > 0) {
    const stringValues = stats.uniqueSamples.filter((v): v is string => typeof v === "string");
    if (stringValues.length === 0) return 0;

    const avgLength = stringValues.reduce((sum, s) => sum + s.length, 0) / stringValues.length;

    if (avgLength >= 20 && avgLength <= 500) return 1;
    if (avgLength >= 10 && avgLength <= 1000) return 0.8;
    if (avgLength < 5) return 0.2;
    if (avgLength > 1000) return 0.7;
    return 0.6;
  }

  return 0.5;
};

/**
 * Validates field as a location name field.
 * Should be mostly strings representing venue/place names.
 */
const validateLocationNameField = (stats: FieldStatistics, stringPct: number, minStringPct?: number): number => {
  if (stringPct < (minStringPct ?? 0.7)) return 0;

  if (stats.uniqueSamples && stats.uniqueSamples.length > 0) {
    const stringValues = stats.uniqueSamples.filter((v): v is string => typeof v === "string");
    if (stringValues.length === 0) return 0;

    const avgLength = stringValues.reduce((sum, s) => sum + s.length, 0) / stringValues.length;

    if (avgLength >= 3 && avgLength <= 50) return 1;
    if (avgLength >= 2 && avgLength <= 100) return 0.8;
    if (avgLength < 2) return 0.2;
    if (avgLength > 100) return 0.6;
    return 0.5;
  }

  return 0.5;
};

/** Check if field contains Date objects or ISO date strings */
const checkDateObjectsOrISOStrings = (stats: FieldStatistics): number => {
  const objectPct = (stats.typeDistribution.object ?? 0) / stats.occurrences;

  if (objectPct <= 0.7 || !stats.uniqueSamples || stats.uniqueSamples.length === 0) {
    return 0;
  }

  const dateObjects = stats.uniqueSamples.filter((v) => v instanceof Date && isValidDate(v));
  const isoDateStrings = stats.uniqueSamples.filter((v): v is string => typeof v === "string" && isImportDateLike(v));
  const dateValueCount = dateObjects.length + isoDateStrings.length;
  const dateValuePct = dateValueCount / stats.uniqueSamples.length;

  if (dateValuePct >= 0.7) return 1;
  if (dateValuePct >= 0.5) return 0.8;
  return 0;
};

/** Check if field has date format indicators */
const checkDateFormat = (stats: FieldStatistics): number => {
  const hasDateFormat = (stats.formats?.date ?? 0) > 0 || (stats.formats?.dateTime ?? 0) > 0;

  if (!hasDateFormat) return 0;

  const dateFormatPct = ((stats.formats?.date ?? 0) + (stats.formats?.dateTime ?? 0)) / stats.occurrences;
  return Math.min(1, 0.7 + dateFormatPct * 0.3);
};

/**
 * Check the schema builder's own date typing.
 *
 * `getValueType` classifies any `isImportDateLike` string as type `"date"` —
 * including non-ISO separated dates like `DD/MM/YYYY` that set neither
 * `formats.date` (ISO-only) nor count as `string`. Without crediting this, a
 * column of `01/02/2024` values scores 0 across the other timestamp checks and is
 * never detected as a timestamp (it then falls into the no-timestamp gate instead
 * of the ambiguous-date-order gate). Mirror `checkDateFormat`'s scoring.
 */
const checkDateTypeDistribution = (stats: FieldStatistics): number => {
  const dateCount = stats.typeDistribution?.date ?? 0;
  if (dateCount <= 0 || stats.occurrences <= 0) return 0;

  const datePct = dateCount / stats.occurrences;
  if (datePct < 0.5) return 0;
  return Math.min(1, 0.7 + datePct * 0.3);
};

/** Check if string values can be parsed as dates */
const checkParseableStrings = (stats: FieldStatistics, stringPct: number): number => {
  if (stringPct <= 0.5 || !stats.uniqueSamples || stats.uniqueSamples.length === 0) {
    return 0;
  }

  const stringValues = stats.uniqueSamples.filter((v): v is string => typeof v === "string");
  let validDateCount = 0;

  for (const value of stringValues.slice(0, 10)) {
    if (isImportDateLike(value)) {
      validDateCount++;
    }
  }

  const validDatePct = validDateCount / Math.min(stringValues.length, 10);
  if (validDatePct >= 0.7) return 0.9;
  if (validDatePct >= 0.5) return 0.7;
  if (validDatePct >= 0.3) return 0.5;
  return 0;
};

/** Check if numeric values are unix timestamps */
const checkUnixTimestamp = (stats: FieldStatistics): number => {
  const hasNumericType = (stats.typeDistribution.number ?? 0) > 0 || (stats.typeDistribution.integer ?? 0) > 0;

  if (!hasNumericType || !stats.numericStats) return 0;

  // Unix timestamps are typically > 1000000000 (Sep 2001)
  if (stats.numericStats.min > 1000000000 && stats.numericStats.max < 9999999999) {
    return 0.8; // Likely unix timestamp in seconds
  }
  if (stats.numericStats.min > 1000000000000 && stats.numericStats.max < 9999999999999) {
    return 0.8; // Likely unix timestamp in milliseconds
  }
  return 0;
};

/**
 * Validates field as a timestamp field.
 * Checks Date objects, format indicators, parseable strings, and unix timestamps.
 */
const validateTimestampField = (stats: FieldStatistics, stringPct: number): number => {
  const dateObjectScore = checkDateObjectsOrISOStrings(stats);
  if (dateObjectScore > 0) return dateObjectScore;

  const dateFormatScore = checkDateFormat(stats);
  if (dateFormatScore > 0) return dateFormatScore;

  // Non-ISO date strings (e.g. DD/MM/YYYY) are typed `date` by the schema builder
  // but set no format flag and don't count as `string`; credit that typing.
  const dateTypeScore = checkDateTypeDistribution(stats);
  if (dateTypeScore > 0) return dateTypeScore;

  const parseableScore = checkParseableStrings(stats, stringPct);
  if (parseableScore > 0) return parseableScore;

  const unixTimestampScore = checkUnixTimestamp(stats);
  if (unixTimestampScore > 0) return unixTimestampScore;

  return 0;
};

/**
 * Validates field as a location field.
 * Should be mostly strings with typical address/location lengths.
 */
const validateLocationField = (stats: FieldStatistics, stringPct: number, minStringPct?: number): number => {
  if (stringPct < (minStringPct ?? 0.7)) return 0;

  if (stats.uniqueSamples && stats.uniqueSamples.length > 0) {
    const stringValues = stats.uniqueSamples.filter((v): v is string => typeof v === "string");
    if (stringValues.length === 0) return 0;

    const avgLength = stringValues.reduce((sum, s) => sum + s.length, 0) / stringValues.length;

    if (avgLength >= 3 && avgLength <= 100) return 1;
    if (avgLength >= 2 && avgLength <= 500) return 0.8;
    if (avgLength < 2) return 0.2;
    if (avgLength > 500) return 0.6;
    return 0.5;
  }

  return 0.5;
};

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

/**
 * Validates field statistics match the expected field type.
 *
 * @param stats - Field statistics to validate
 * @param fieldType - The field type to validate against
 * @param overrides - Optional validator configuration overrides
 * @param customValidator - Optional function that fully replaces the built-in validator
 * @returns Validation score from 0 (invalid) to 1 (perfect match)
 */
export const validateFieldType = (
  stats: FieldStatistics,
  fieldType: string,
  overrides?: ValidatorConfig,
  customValidator?: (stats: FieldStatistics) => number
): number => {
  if (customValidator) return customValidator(stats);

  const stringPct = (stats.typeDistribution.string ?? 0) / stats.occurrences;

  // Apply minStringPct override to fields that have a string-percentage threshold
  const effectiveStringPct = overrides?.minStringPct;

  switch (fieldType) {
    case "title":
      return validateTitleField(stats, stringPct, effectiveStringPct);
    case "description":
      return validateDescriptionField(stats, stringPct, effectiveStringPct);
    case "locationName":
      return validateLocationNameField(stats, stringPct, effectiveStringPct);
    case "timestamp":
    case "endTimestamp":
      return validateTimestampField(stats, stringPct);
    case "location":
      return validateLocationField(stats, stringPct, effectiveStringPct);
    default:
      return 0;
  }
};
