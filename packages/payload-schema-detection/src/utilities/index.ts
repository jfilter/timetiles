/**
 * Detection utility functions.
 *
 * These utilities can be used by custom detectors to leverage
 * the built-in detection logic while customizing other aspects.
 *
 * @module
 * @category Utilities
 */

export { detectEnumFields, detectIdFields, detectPatterns, looksLikeCoordinate, looksLikeId } from "./geo";
export {
  detectLanguage,
  detectLanguageFromText,
  extractTextForLanguageDetection,
  isSupportedLanguage,
  LANGUAGE_NAMES,
  SUPPORTED_LANGUAGES,
} from "./language";
export {
  COMBINED_COORDINATE_PATTERNS,
  COORDINATE_BOUNDS,
  detectFieldMappings,
  detectGeoFields,
  FIELD_PATTERNS,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
} from "./patterns";
