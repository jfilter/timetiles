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
export type { SchemaDetector, DetectionContext, DetectionResult, LanguageResult, FieldMapping, GeoFieldMapping, FieldMappingsResult, PatternResult, DetectorConfig, FieldStatistics, SchemaDetectionPluginOptions, SchemaDetectionPlugin, } from "./types";
export { SchemaDetectionService } from "./service";
export { defaultDetector } from "./detectors/default-detector";
export { schemaDetectionPlugin } from "./plugin";
//# sourceMappingURL=index.d.ts.map