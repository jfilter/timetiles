/**
 * Detection utility functions.
 *
 * These utilities can be used by custom detectors to leverage
 * the built-in detection logic while customizing other aspects.
 *
 * @module
 * @category Utilities
 */

export { detectGeoFields } from "./coordinates";
export type { FieldMappings } from "./flat-mappings";
export { detectFlatFieldMappings, toFlatMappings } from "./flat-mappings";
export {
  detectEnumFields,
  detectIdFields,
  detectPatterns,
  enrichEnumFields,
  looksLikeCoordinate,
  looksLikeId,
} from "./geo";
export {
  detectLanguage,
  detectLanguageFromText,
  extractTextForLanguageDetection,
  isSupportedLanguage,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
} from "./language";
export type { FieldPatternMatch } from "./patterns";
export {
  COMBINED_COORDINATE_PATTERNS,
  COORDINATE_BOUNDS,
  detectFieldMappings,
  FIELD_PATTERNS,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
} from "./patterns";
export type { DetectionOptions, ValidatorConfig } from "../types";
export { validateFieldType } from "./validators";
