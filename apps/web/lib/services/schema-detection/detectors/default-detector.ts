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

import type { DetectionContext, DetectionOptions, DetectionResult, LanguageResult, SchemaDetector } from "../types";
import { detectPatterns } from "../utilities/geo";
import { detectLanguage, LANGUAGE_NAMES } from "../utilities/language";
import { detectFieldMappings } from "../utilities/patterns";

/**
 * Creates a default schema detector with optional detection overrides.
 *
 * When called without options, produces the same behavior as the original
 * `defaultDetector` constant. Options allow customizing language detection,
 * field patterns, scoring weights, validators, coordinate detection, and
 * pipeline stages.
 *
 * @param options - Optional detection options for customizing behavior
 * @returns A SchemaDetector instance
 *
 * @example
 * ```typescript
 * // No options — identical to the original defaultDetector
 * const detector = createDefaultDetector();
 *
 * // Force German language, skip enum detection
 * const customDetector = createDefaultDetector({
 *   language: "deu",
 *   skip: { enums: true },
 * });
 * ```
 */
export const createDefaultDetector = (options?: DetectionOptions): SchemaDetector => ({
  name: "default",
  label: "Default Schema Detector",
  description:
    "Multi-language detection with standard field patterns for title, description, start/end timestamps, and location fields",

  /**
   * Default detector always handles input.
   */
  canHandle: (): boolean => true,

  /**
   * Perform full schema detection.
   */
  // eslint-disable-next-line @typescript-eslint/require-await -- Returns Promise for interface compatibility
  detect: async (context: DetectionContext): Promise<DetectionResult> => {
    // Step 1: Detect language from sample data
    let language: LanguageResult;

    if (options?.skip?.language) {
      language = { code: "eng", name: "English", confidence: 0, isReliable: false };
    } else if (options?.language) {
      language = {
        code: options.language,
        name: LANGUAGE_NAMES[options.language] ?? options.language,
        confidence: 1,
        isReliable: true,
      };
    } else if (options?.customLanguageDetector) {
      language = options.customLanguageDetector(context.sampleData, context.headers);
    } else {
      language = detectLanguage(context.sampleData, context.headers);
      if (options?.languageConfidenceThreshold && language.confidence < options.languageConfidenceThreshold) {
        language = { ...language, isReliable: false };
      }
    }

    // Step 2: Detect field mappings using detected language
    const fieldMappings = detectFieldMappings(context.fieldStats, language.code, options);

    // Step 3: Detect structural patterns (IDs, enums)
    const patterns = detectPatterns(context.fieldStats, undefined, options);

    return { language, fieldMappings, patterns };
  },
});

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
export const defaultDetector: SchemaDetector = createDefaultDetector();
