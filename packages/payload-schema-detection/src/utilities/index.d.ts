/**
 * Detection utility functions.
 *
 * These utilities can be used by custom detectors to leverage
 * the built-in detection logic while customizing other aspects.
 *
 * @module
 * @category Utilities
 */
export { detectLanguage, detectLanguageFromText, extractTextForLanguageDetection, isSupportedLanguage, SUPPORTED_LANGUAGES, LANGUAGE_NAMES, } from "./language";
export { detectFieldMappings, detectGeoFields, FIELD_PATTERNS, LATITUDE_PATTERNS, LONGITUDE_PATTERNS, COMBINED_COORDINATE_PATTERNS, COORDINATE_BOUNDS, } from "./patterns";
export { detectPatterns, detectIdFields, detectEnumFields, looksLikeId, looksLikeCoordinate, } from "./geo";
//# sourceMappingURL=index.d.ts.map