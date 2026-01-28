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

import type { DetectionContext, DetectionResult, SchemaDetector } from "../types";
import { detectPatterns } from "../utilities/geo";
import { detectLanguage } from "../utilities/language";
import { detectFieldMappings } from "../utilities/patterns";

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
export const defaultDetector: SchemaDetector = {
  name: "default",
  label: "Default Schema Detector",
  description:
    "Multi-language detection with standard field patterns for title, description, timestamp, and location fields",

  /**
   * Default detector always handles input.
   */
  canHandle: (): boolean => true,

  /**
   * Perform full schema detection.
   */
  detect: async (context: DetectionContext): Promise<DetectionResult> => {
    // Step 1: Detect language from sample data
    const language = detectLanguage(context.sampleData, context.headers);

    // Step 2: Detect field mappings using detected language
    const fieldMappings = detectFieldMappings(context.fieldStats, language.code);

    // Step 3: Detect structural patterns (IDs, enums)
    const patterns = detectPatterns(context.fieldStats);

    return {
      language,
      fieldMappings,
      patterns,
    };
  },
};
