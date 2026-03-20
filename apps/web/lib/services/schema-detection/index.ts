/**
 * Schema detection service for import workflows.
 *
 * Provides language-aware schema detection with support for custom detectors
 * and automatic fallback to a default detector. Includes field mapping
 * detection, language detection, and structural pattern analysis.
 *
 * @module
 * @category Services
 */

// Core types
export type {
  DetectionContext,
  DetectionResult,
  DetectorConfig,
  FieldMapping,
  FieldMappingsResult,
  FieldStatistics,
  GeoFieldMapping,
  LanguageResult,
  PatternResult,
  SchemaDetectionPlugin,
  SchemaDetectionPluginOptions,
  SchemaDetector,
} from "./types";

// Detection service
export { SchemaDetectionService } from "./service";

// Default detector
export { defaultDetector } from "./detectors/default-detector";

// Payload plugin
export { schemaDetectionPlugin } from "./plugin";

// Pattern constants and matching utilities
export { detectGeoFields } from "./utilities/coordinates";
export type { FieldPatternMatch } from "./utilities/patterns";
export {
  ADDRESS_PATTERNS,
  COMBINED_COORDINATE_PATTERNS,
  COORDINATE_BOUNDS,
  detectFieldMappings,
  FIELD_PATTERNS,
  getFieldPatterns,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
  matchFieldNamePatterns,
} from "./utilities/patterns";

// Language detection utility
export { detectLanguage, LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from "./utilities/language";
