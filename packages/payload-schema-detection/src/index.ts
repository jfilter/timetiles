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

// Pattern constants for external use
export {
  ADDRESS_PATTERNS,
  COMBINED_COORDINATE_PATTERNS,
  COORDINATE_BOUNDS,
  detectFieldMappings,
  detectGeoFields,
  FIELD_PATTERNS,
  LATITUDE_PATTERNS,
  LONGITUDE_PATTERNS,
} from "./utilities/patterns";

// Language detection utility
export { detectLanguage, LANGUAGE_NAMES, SUPPORTED_LANGUAGES } from "./utilities/language";
