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
import type { SchemaDetector, DetectionContext, DetectionResult } from "./types";
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
export declare class SchemaDetectionService {
    private detectors;
    private defaultDetector;
    /**
     * Create a new detection service with the given detectors.
     *
     * @param detectors - Array of detectors to register. The detector named 'default'
     *                    will be used as the fallback when other detectors can't handle input.
     */
    constructor(detectors: SchemaDetector[]);
    /**
     * Register a new detector.
     */
    register(detector: SchemaDetector): void;
    /**
     * Get a detector by name.
     */
    getDetector(name: string): SchemaDetector | undefined;
    /**
     * Get all registered detectors.
     */
    getAllDetectors(): SchemaDetector[];
    /**
     * Run detection using the specified detector with fallback to default.
     *
     * @param detectorName - Name of the detector to use, or null to use default
     * @param context - Detection context containing field stats, samples, headers
     * @returns Detection result with language, field mappings, and patterns
     */
    detect(detectorName: string | null, context: DetectionContext): Promise<DetectionResult>;
    /**
     * Find the first detector that can handle the given context.
     *
     * @param context - Detection context
     * @returns The first detector that can handle the input, or null
     */
    findCompatibleDetector(context: DetectionContext): Promise<SchemaDetector | null>;
    /**
     * Get an empty detection result for when no detectors are available.
     */
    private getEmptyResult;
}
//# sourceMappingURL=service.d.ts.map