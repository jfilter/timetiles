/**
 * Schema Detection Payload Plugin.
 *
 * A Payload CMS plugin that provides language-aware schema detection
 * for import workflows. Follows the Payload plugin pattern:
 * (options) => (config) => modifiedConfig
 *
 * @module
 * @category Plugins
 */
import type { Config } from "payload";
import type { SchemaDetectionPluginOptions } from "./types";
/**
 * Schema Detection Plugin for Payload CMS.
 *
 * Adds schema detection capabilities to your Payload application:
 * - A schema-detectors collection for database-driven configuration
 * - A detector selection field on the Datasets collection
 * - A SchemaDetectionService accessible via config.custom.schemaDetection
 *
 * @example
 * ```typescript
 * import { schemaDetectionPlugin, defaultDetector } from '@timetiles/payload-schema-detection';
 *
 * export default buildConfig({
 *   plugins: [
 *     schemaDetectionPlugin({
 *       detectors: [myCustomDetector, defaultDetector],
 *       extendDatasets: true,
 *     }),
 *   ],
 * });
 *
 * // Later, access the service:
 * const service = payload.config.custom.schemaDetection.service;
 * const result = await service.detect('my-detector', context);
 * ```
 */
export declare const schemaDetectionPlugin: (options?: SchemaDetectionPluginOptions) => (incomingConfig: Config) => Config;
//# sourceMappingURL=plugin.d.ts.map