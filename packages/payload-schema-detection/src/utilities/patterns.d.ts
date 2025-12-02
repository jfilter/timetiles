/**
 * Field pattern matching utilities.
 *
 * Provides language-aware pattern matching for detecting standard
 * event fields (title, description, timestamp, location) based on
 * column names and data characteristics.
 *
 * @module
 * @category Utilities
 */
import type { FieldStatistics, FieldMappingsResult, GeoFieldMapping } from "../types";
/**
 * Language-specific field name patterns.
 *
 * Patterns are ordered by specificity - more specific patterns first
 * to ensure higher confidence scores for better matches.
 */
export declare const FIELD_PATTERNS: {
    readonly title: {
        readonly eng: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly deu: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly fra: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly spa: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly ita: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly nld: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly por: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    };
    readonly description: {
        readonly eng: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly deu: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly fra: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly spa: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly ita: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly nld: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly por: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    };
    readonly locationName: {
        readonly eng: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly deu: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly fra: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly spa: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly ita: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly nld: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly por: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    };
    readonly timestamp: {
        readonly eng: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly deu: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly fra: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly spa: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly ita: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly nld: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
        readonly por: readonly [RegExp, RegExp, RegExp, RegExp, RegExp, RegExp, RegExp];
    };
};
/**
 * Latitude patterns for coordinate detection.
 */
export declare const LATITUDE_PATTERNS: RegExp[];
/**
 * Longitude patterns for coordinate detection.
 */
export declare const LONGITUDE_PATTERNS: RegExp[];
/**
 * Combined coordinate patterns.
 */
export declare const COMBINED_COORDINATE_PATTERNS: RegExp[];
/**
 * Valid coordinate bounds.
 */
export declare const COORDINATE_BOUNDS: {
    latitude: {
        min: number;
        max: number;
    };
    longitude: {
        min: number;
        max: number;
    };
};
/**
 * Detect geo field mappings.
 */
export declare const detectGeoFields: (fieldStats: Record<string, FieldStatistics>) => GeoFieldMapping | null;
/**
 * Detect field mappings for all standard fields.
 *
 * @param fieldStats - Field statistics from schema builder
 * @param language - ISO 639-3 language code
 * @returns Field mappings result
 */
export declare const detectFieldMappings: (fieldStats: Record<string, FieldStatistics>, language: string) => FieldMappingsResult;
//# sourceMappingURL=patterns.d.ts.map