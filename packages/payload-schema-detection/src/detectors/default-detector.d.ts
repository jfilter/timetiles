/**
 * Default Schema Detector.
 *
 * The default detector handles all schema detection by combining
 * language detection with language-aware field mapping and
 * structural pattern detection.
 *
 * This detector always returns results and serves as the fallback
 * when custom detectors cannot handle the input.
 *
 * @module
 * @category Detectors
 */
import type { SchemaDetector } from "../types";
/**
 * Default schema detector that handles all input types.
 *
 * Uses:
 * - franc library for language detection (7 languages)
 * - Language-aware patterns for field mapping
 * - Structural analysis for ID and enum detection
 *
 * @example
 * ```typescript
 * import { schemaDetectionPlugin, defaultDetector } from '@timetiles/payload-schema-detection';
 *
 * export default buildConfig({
 *   plugins: [
 *     schemaDetectionPlugin({
 *       detectors: [defaultDetector],
 *     }),
 *   ],
 * });
 * ```
 */
export declare const defaultDetector: SchemaDetector;
//# sourceMappingURL=default-detector.d.ts.map