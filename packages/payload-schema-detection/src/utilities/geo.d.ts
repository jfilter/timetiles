/**
 * Structural pattern detection utilities.
 *
 * Provides detection of ID fields and enumeration fields
 * based on data characteristics (not column names).
 *
 * @module
 * @category Utilities
 */
import type { FieldStatistics, PatternResult } from "../types";
/**
 * Detects potential ID fields based on naming patterns and characteristics.
 */
export declare const detectIdFields: (fieldStats: Record<string, FieldStatistics>) => string[];
/**
 * Detects enumeration fields based on low cardinality.
 */
export declare const detectEnumFields: (fieldStats: Record<string, FieldStatistics>, config?: {
    enumThreshold?: number;
    enumMode?: "count" | "percentage";
}) => string[];
/**
 * Detect all structural patterns in field statistics.
 */
export declare const detectPatterns: (fieldStats: Record<string, FieldStatistics>, config?: {
    enumThreshold?: number;
    enumMode?: "count" | "percentage";
}) => PatternResult;
/**
 * Checks if a value looks like an ID.
 */
export declare const looksLikeId: (value: unknown) => boolean;
/**
 * Checks if a value looks like a geographic coordinate.
 */
export declare const looksLikeCoordinate: (value: unknown, type: "lat" | "lng") => boolean;
//# sourceMappingURL=geo.d.ts.map