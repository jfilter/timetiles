/**
 * Schema Detection Service.
 *
 * Manages detector selection and execution. Similar to how geocoding
 * providers work - you select a detector for a dataset, and it handles
 * all detection with automatic fallback to the default detector.
 *
 * @module
 * @category Services
 */

import type { DetectionContext, DetectionResult, SchemaDetector } from "./types";

/**
 * Service for managing and executing schema detectors.
 *
 * @example
 * ```typescript
 * const service = new SchemaDetectionService([customDetector, defaultDetector]);
 *
 * const result = await service.detect('custom-detector', {
 *   fieldStats: stats,
 *   sampleData: samples,
 *   headers: ['name', 'date', 'location'],
 *   config: { enabled: true, priority: 1 }
 * });
 * ```
 */
export class SchemaDetectionService {
  private readonly detectors: Map<string, SchemaDetector> = new Map();
  private defaultDetector: SchemaDetector | null = null;

  /**
   * Create a new detection service with the given detectors.
   *
   * @param detectors - Array of detectors to register. The detector named 'default'
   *                    will be used as the fallback when other detectors can't handle input.
   */
  constructor(detectors: SchemaDetector[]) {
    for (const detector of detectors) {
      this.detectors.set(detector.name, detector);
      if (detector.name === "default") {
        this.defaultDetector = detector;
      }
    }

    // If no explicit default, use the last registered detector as fallback
    if (!this.defaultDetector && detectors.length > 0) {
      this.defaultDetector = detectors[detectors.length - 1] ?? null;
    }
  }

  /**
   * Register a new detector.
   */
  register(detector: SchemaDetector): void {
    this.detectors.set(detector.name, detector);
    if (detector.name === "default") {
      this.defaultDetector = detector;
    }
  }

  /**
   * Get a detector by name.
   */
  getDetector(name: string): SchemaDetector | undefined {
    return this.detectors.get(name);
  }

  /**
   * Get all registered detectors.
   */
  getAllDetectors(): SchemaDetector[] {
    return Array.from(this.detectors.values());
  }

  /**
   * Run detection using the specified detector with fallback to default.
   *
   * @param detectorName - Name of the detector to use, or null to use default
   * @param context - Detection context containing field stats, samples, headers
   * @returns Detection result with language, field mappings, and patterns
   */
  async detect(detectorName: string | null, context: DetectionContext): Promise<DetectionResult> {
    // Try to use the specified detector
    if (detectorName) {
      const detector = this.detectors.get(detectorName);
      if (detector) {
        const canHandle = await detector.canHandle(context);
        if (canHandle) {
          return detector.detect(context);
        }
      }
    }

    // Fall back to default detector
    if (this.defaultDetector) {
      return this.defaultDetector.detect(context);
    }

    // No detectors available - return empty result
    return this.getEmptyResult();
  }

  /**
   * Find the first detector that can handle the given context.
   *
   * @param context - Detection context
   * @returns The first detector that can handle the input, or null
   */
  async findCompatibleDetector(context: DetectionContext): Promise<SchemaDetector | null> {
    // Check non-default detectors first (sorted by priority if configs available)
    const nonDefaultDetectors = Array.from(this.detectors.values()).filter((d) => d.name !== "default");

    for (const detector of nonDefaultDetectors) {
      const canHandle = await detector.canHandle(context);
      if (canHandle) {
        return detector;
      }
    }

    // Fall back to default
    return this.defaultDetector;
  }

  /**
   * Get an empty detection result for when no detectors are available.
   */
  private getEmptyResult(): DetectionResult {
    return {
      language: {
        code: "eng",
        name: "English",
        confidence: 0,
        isReliable: false,
      },
      fieldMappings: {
        title: null,
        description: null,
        timestamp: null,
        locationName: null,
        geo: null,
      },
      patterns: {
        idFields: [],
        enumFields: [],
      },
    };
  }
}
