/**
 * Detection options merging utility.
 *
 * Provides a function to merge two DetectionOptions objects together,
 * following specific rules for each option type: scalars use last-wins,
 * arrays prepend the override, skip flags OR together, and nested objects
 * are deep-merged.
 *
 * @module
 * @category Detectors
 */

import type { DetectionOptions } from "../types";

/**
 * Merge two RegExp arrays: override items come first (higher priority),
 * followed by base items.
 */
const mergeRegExpArrays = (base?: RegExp[], override?: RegExp[]): RegExp[] | undefined => {
  if (!base && !override) return undefined;
  if (!base) return override;
  if (!override) return base;
  return [...override, ...base];
};

/** Merge scalar options (override wins). */
const mergeScalars = (result: DetectionOptions, base: DetectionOptions, override: DetectionOptions): void => {
  const language = override.language ?? base.language;
  if (language !== undefined) result.language = language;

  const languageConfidenceThreshold = override.languageConfidenceThreshold ?? base.languageConfidenceThreshold;
  if (languageConfidenceThreshold !== undefined) result.languageConfidenceThreshold = languageConfidenceThreshold;

  const customLanguageDetector = override.customLanguageDetector ?? base.customLanguageDetector;
  if (customLanguageDetector !== undefined) result.customLanguageDetector = customLanguageDetector;

  const scoringWeights = override.scoringWeights ?? base.scoringWeights;
  if (scoringWeights !== undefined) result.scoringWeights = scoringWeights;

  const enumThreshold = override.enumThreshold ?? base.enumThreshold;
  if (enumThreshold !== undefined) result.enumThreshold = enumThreshold;

  const enumMode = override.enumMode ?? base.enumMode;
  if (enumMode !== undefined) result.enumMode = enumMode;

  const replaceCoordinatePatterns = override.replaceCoordinatePatterns ?? base.replaceCoordinatePatterns;
  if (replaceCoordinatePatterns !== undefined) result.replaceCoordinatePatterns = replaceCoordinatePatterns;

  const replaceAddressPatterns = override.replaceAddressPatterns ?? base.replaceAddressPatterns;
  if (replaceAddressPatterns !== undefined) result.replaceAddressPatterns = replaceAddressPatterns;

  const replaceIdPatterns = override.replaceIdPatterns ?? base.replaceIdPatterns;
  if (replaceIdPatterns !== undefined) result.replaceIdPatterns = replaceIdPatterns;
};

/** Merge RegExp array options (override prepends to base). */
const mergePatternArrays = (result: DetectionOptions, base: DetectionOptions, override: DetectionOptions): void => {
  const latitudePatterns = mergeRegExpArrays(base.latitudePatterns, override.latitudePatterns);
  if (latitudePatterns) result.latitudePatterns = latitudePatterns;

  const longitudePatterns = mergeRegExpArrays(base.longitudePatterns, override.longitudePatterns);
  if (longitudePatterns) result.longitudePatterns = longitudePatterns;

  const combinedCoordinatePatterns = mergeRegExpArrays(
    base.combinedCoordinatePatterns,
    override.combinedCoordinatePatterns
  );
  if (combinedCoordinatePatterns) result.combinedCoordinatePatterns = combinedCoordinatePatterns;

  const addressPatterns = mergeRegExpArrays(base.addressPatterns, override.addressPatterns);
  if (addressPatterns) result.addressPatterns = addressPatterns;

  const idPatterns = mergeRegExpArrays(base.idPatterns, override.idPatterns);
  if (idPatterns) result.idPatterns = idPatterns;
};

/** Merge string-list options (concatenate and deduplicate). */
const mergeStringLists = (result: DetectionOptions, base: DetectionOptions, override: DetectionOptions): void => {
  if (base.replacePatterns || override.replacePatterns) {
    result.replacePatterns = [...new Set([...(base.replacePatterns ?? []), ...(override.replacePatterns ?? [])])];
  }

  if (base.additionalLanguages || override.additionalLanguages) {
    result.additionalLanguages = [
      ...new Set([...(base.additionalLanguages ?? []), ...(override.additionalLanguages ?? [])]),
    ];
  }
};

/** OR two optional booleans (true wins over false/undefined). */
const orBool = (a?: boolean, b?: boolean): boolean => Boolean(a) || Boolean(b);

/** Merge skip flags (OR together -- true wins). */
const mergeSkipFlags = (result: DetectionOptions, base: DetectionOptions, override: DetectionOptions): void => {
  const bs = base.skip;
  const os = override.skip;
  if (!bs && !os) return;
  result.skip = {
    language: orBool(bs?.language, os?.language),
    fieldMapping: orBool(bs?.fieldMapping, os?.fieldMapping),
    coordinates: orBool(bs?.coordinates, os?.coordinates),
    enums: orBool(bs?.enums, os?.enums),
    ids: orBool(bs?.ids, os?.ids),
  };
};

/** Merge language-keyed pattern maps for a single field type. */
const mergeLanguagePatterns = (
  baseLangs: Partial<Record<string, RegExp[]>>,
  overrideLangs: Partial<Record<string, RegExp[]>>
): Partial<Record<string, RegExp[]>> => {
  const allLangs = new Set([...Object.keys(baseLangs), ...Object.keys(overrideLangs)]);
  const mergedLangs: Partial<Record<string, RegExp[]>> = {};
  for (const lang of allLangs) {
    mergedLangs[lang] = mergeRegExpArrays(baseLangs[lang], overrideLangs[lang]);
  }
  return mergedLangs;
};

/** Merge fieldPatterns (deep merge by field type then language). */
const mergeFieldPatterns = (result: DetectionOptions, base: DetectionOptions, override: DetectionOptions): void => {
  if (!base.fieldPatterns && !override.fieldPatterns) return;

  const allFieldTypes = new Set([
    ...Object.keys(base.fieldPatterns ?? {}),
    ...Object.keys(override.fieldPatterns ?? {}),
  ]);
  const merged: Partial<Record<string, Partial<Record<string, RegExp[]>>>> = {};

  for (const fieldType of allFieldTypes) {
    merged[fieldType] = mergeLanguagePatterns(
      base.fieldPatterns?.[fieldType] ?? {},
      override.fieldPatterns?.[fieldType] ?? {}
    );
  }
  result.fieldPatterns = merged;
};

/** Merge nested object options (shallow merge -- override wins per key). */
const mergeNestedObjects = (result: DetectionOptions, base: DetectionOptions, override: DetectionOptions): void => {
  if (base.validatorOverrides || override.validatorOverrides) {
    result.validatorOverrides = { ...base.validatorOverrides, ...override.validatorOverrides };
  }

  if (base.customValidators || override.customValidators) {
    result.customValidators = { ...base.customValidators, ...override.customValidators };
  }

  if (base.coordinateBounds || override.coordinateBounds) {
    result.coordinateBounds = {
      latitude: override.coordinateBounds?.latitude ?? base.coordinateBounds?.latitude,
      longitude: override.coordinateBounds?.longitude ?? base.coordinateBounds?.longitude,
    };
  }

  if (base.additionalFieldTypes || override.additionalFieldTypes) {
    result.additionalFieldTypes = { ...base.additionalFieldTypes, ...override.additionalFieldTypes };
  }
};

/**
 * Merge two DetectionOptions objects.
 *
 * Merge rules:
 * - **Scalars** (`language`, `languageConfidenceThreshold`, `scoringWeights`, etc.): override wins.
 * - **RegExp arrays** (`latitudePatterns`, `longitudePatterns`, etc.): override prepends to base.
 * - **`fieldPatterns`**: deep merge by field type, then by language; per-language arrays are prepended.
 * - **`replacePatterns`**: concatenated and deduplicated.
 * - **`skip`**: OR together (true wins).
 * - **Nested objects** (`validatorOverrides`, `customValidators`, `additionalFieldTypes`): deep merge; override wins per key.
 * - **Functions** (`customLanguageDetector`): override wins.
 *
 * @param base - Base options (lower priority)
 * @param override - Override options (higher priority)
 * @returns Merged options
 */
export const mergeDetectionOptions = (base: DetectionOptions, override: DetectionOptions): DetectionOptions => {
  const result: DetectionOptions = {};

  mergeScalars(result, base, override);
  mergePatternArrays(result, base, override);
  mergeStringLists(result, base, override);
  mergeSkipFlags(result, base, override);
  mergeFieldPatterns(result, base, override);
  mergeNestedObjects(result, base, override);

  return result;
};
