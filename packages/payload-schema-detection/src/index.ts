/**
 * Schema Detection Plugin for Payload CMS.
 *
 * A Payload CMS plugin that provides language-aware schema detection
 * for import workflows. Supports custom detectors for domain-specific
 * data formats with automatic fallback to a default detector.
 *
 * @example
 * ```typescript
 * import { schemaDetectionPlugin, defaultDetector } from '@timetiles/payload-schema-detection';
 *
 * export default buildConfig({
 *   plugins: [
 *     schemaDetectionPlugin({
 *       detectors: [myCustomDetector, defaultDetector],
 *     }),
 *   ],
 * });
 * ```
 *
 * @module
 * @category Plugins
 */

// Core types
export type {
  SchemaDetector,
  DetectionContext,
  DetectionResult,
  LanguageResult,
  FieldMapping,
  GeoFieldMapping,
  FieldMappingsResult,
  PatternResult,
  DetectorConfig,
  FieldStatistics,
  SchemaDetectionPluginOptions,
  SchemaDetectionPlugin,
} from "./types";

// Detection service
export { SchemaDetectionService } from "./service";

// Default detector
export { defaultDetector } from "./detectors/default-detector";

// Payload plugin
export { schemaDetectionPlugin } from "./plugin";

// Pattern constants for external use
export {
  FIELD_PATTERNS,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
  COMBINED_COORDINATE_PATTERNS,
  ADDRESS_PATTERNS,
  COORDINATE_BOUNDS,
  detectFieldMappings,
  detectGeoFields,
} from "./utilities/patterns";

// Language detection utility
export { detectLanguage, SUPPORTED_LANGUAGES, LANGUAGE_NAMES } from "./utilities/language";
