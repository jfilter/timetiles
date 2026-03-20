/**
 * Core types for the schema detection plugin.
 *
 * This module defines the interfaces for schema detectors, detection context,
 * and detection results used throughout the plugin.
 *
 * @module
 * @category Types
 */

import type { Config } from "payload";

import type { FieldStatistics } from "@/lib/types/schema-detection";

// Re-export the canonical FieldStatistics from the app's type definitions
export type { FieldStatistics } from "@/lib/types/schema-detection";

/**
 * A schema detector is a single plugin that handles ALL detection for a file/dataset.
 * Similar to how geocoding providers work - you select one, it does the job.
 */
export interface SchemaDetector {
  /** Unique detector name (used for selection and DB storage) */
  name: string;

  /** Human-readable label for admin UI */
  label: string;

  /** Description for admin UI */
  description?: string;

  /**
   * Check if this detector can handle the given input.
   * Return false to fall back to default detector.
   */
  canHandle: (context: DetectionContext) => boolean | Promise<boolean>;

  /**
   * Perform ALL detection in one call.
   * Returns language, field mappings, and patterns together.
   */
  detect: (context: DetectionContext) => DetectionResult | Promise<DetectionResult>;
}

/**
 * Context passed to detectors containing all information needed for detection.
 */
export interface DetectionContext {
  /** Field statistics from schema builder */
  fieldStats: Record<string, FieldStatistics>;
  /** Sample data rows */
  sampleData: Record<string, unknown>[];
  /** Column headers */
  headers: string[];
  /** Configuration from database (if available) */
  config: DetectorConfig;
}

/**
 * Complete detection result returned by a detector.
 */
export interface DetectionResult {
  /** Detected language */
  language: LanguageResult;
  /** Field mappings - all semantic field detection consolidated here */
  fieldMappings: FieldMappingsResult;
  /** Pattern detection - structural patterns only */
  patterns: PatternResult;
}

/**
 * Language detection result.
 */
export interface LanguageResult {
  /** ISO 639-3 language code (e.g., 'eng', 'deu', 'fra') */
  code: string;
  /** Human-readable language name */
  name: string;
  /** Confidence score from 0-1 */
  confidence: number;
  /** Whether the detection is considered reliable (confidence > 0.5) */
  isReliable: boolean;
}

/**
 * A single field mapping with confidence score.
 */
export interface FieldMapping {
  /** Path to the field in the data */
  path: string;
  /** Confidence score from 0-1 */
  confidence: number;
}

/**
 * Geo field mapping - supports both separate and combined coordinate formats.
 */
export interface GeoFieldMapping {
  /** Type of geo field: separate lat/lng columns or combined */
  type: "separate" | "combined";
  /** Overall confidence score */
  confidence: number;
  /** For separate lat/lng columns */
  latitude?: FieldMapping;
  /** For separate lat/lng columns */
  longitude?: FieldMapping;
  /** For combined coordinate field (e.g., "lat,lng" or GeoJSON) */
  combined?: { path: string; format: string };
  /** Address/location field for geocoding (when coordinates not available) */
  locationField?: FieldMapping;
}

/**
 * All field mappings detected for a schema.
 */
export interface FieldMappingsResult {
  /** Title/name field */
  title: FieldMapping | null;
  /** Description/details field */
  description: FieldMapping | null;
  /** Timestamp/date field */
  timestamp: FieldMapping | null;
  /** Location name/venue field */
  locationName: FieldMapping | null;
  /** Geo coordinates - all coordinate info in one place */
  geo: GeoFieldMapping | null;
}

/**
 * Structural pattern detection results.
 */
export interface PatternResult {
  /** Fields that appear to be unique identifiers */
  idFields: string[];
  /** Fields that appear to be enumerations (low cardinality) */
  enumFields: string[];
}

/**
 * Configuration for a detector stored in database.
 */
export interface DetectorConfig {
  /** Whether this detector is enabled */
  enabled: boolean;
  /** Priority (lower = higher priority) */
  priority: number;
  /** Detector-specific options */
  options?: Record<string, unknown>;
}

/**
 * Configuration for overriding built-in field validators.
 */
export interface ValidatorConfig {
  /** Minimum string percentage threshold (overrides per-field-type defaults like 0.8 for title). */
  minStringPct?: number;
  /** Ideal length range [min, max] for full score. */
  idealLengthRange?: [number, number];
  /** Acceptable length range [min, max] for partial score. */
  acceptableLengthRange?: [number, number];
}

/**
 * Options to customize schema detection behavior.
 *
 * All options are optional. When omitted, detection uses built-in defaults.
 * Options can be passed to `createDefaultDetector()` or individual utility functions.
 */
export interface DetectionOptions {
  /** Force a specific ISO 639-3 language code (skips language detection). */
  language?: string;
  /** Additional languages to check alongside detected language. */
  additionalLanguages?: string[];
  /** Confidence threshold; below this the result is marked unreliable. */
  languageConfidenceThreshold?: number;
  /** Fully replace the built-in language detector. */
  customLanguageDetector?: (sampleData: Record<string, unknown>[], headers: string[]) => LanguageResult;
  /** Extra field-name patterns keyed by field type then language code. */
  fieldPatterns?: Partial<Record<string, Partial<Record<string, RegExp[]>>>>;
  /** Field types whose default patterns should be replaced (not appended) by fieldPatterns. */
  replacePatterns?: string[];
  /** Scoring weights [patternWeight, validationWeight] (default [0.6, 0.4]). */
  scoringWeights?: [number, number];
  /** Per-field-type validator config overrides. */
  validatorOverrides?: Partial<Record<string, ValidatorConfig>>;
  /** Per-field-type custom validator functions that fully replace the built-in validator. */
  customValidators?: Partial<Record<string, (stats: FieldStatistics) => number>>;
  /** Extra latitude column-name patterns. */
  latitudePatterns?: RegExp[];
  /** Extra longitude column-name patterns. */
  longitudePatterns?: RegExp[];
  /** Extra combined-coordinate column-name patterns. */
  combinedCoordinatePatterns?: RegExp[];
  /** When true, custom coordinate patterns replace defaults instead of prepending. */
  replaceCoordinatePatterns?: boolean;
  /** Custom coordinate bounds for validation. */
  coordinateBounds?: { latitude?: { min: number; max: number }; longitude?: { min: number; max: number } };
  /** Extra address/location column-name patterns. */
  addressPatterns?: RegExp[];
  /** When true, custom address patterns replace defaults instead of prepending. */
  replaceAddressPatterns?: boolean;
  /** Enum detection threshold (absolute count or percentage depending on enumMode). */
  enumThreshold?: number;
  /** Enum detection mode: "count" uses absolute unique-value count, "percentage" uses ratio. */
  enumMode?: "count" | "percentage";
  /** Extra ID column-name patterns. */
  idPatterns?: RegExp[];
  /** When true, custom ID patterns replace defaults instead of prepending. */
  replaceIdPatterns?: boolean;
  /** Skip individual pipeline stages. */
  skip?: { language?: boolean; fieldMapping?: boolean; coordinates?: boolean; enums?: boolean; ids?: boolean };
  /** Register additional field types beyond the standard five. */
  additionalFieldTypes?: Record<
    string,
    { patterns: Partial<Record<string, RegExp[]>>; validator: (stats: FieldStatistics) => number }
  >;
}

/**
 * Options for the schema detection Payload plugin.
 */
export interface SchemaDetectionPluginOptions {
  /** Enable/disable the plugin entirely */
  enabled?: boolean;

  /** Built-in detectors to register (default: [defaultDetector]) */
  detectors?: SchemaDetector[];

  /** Collection slug for schema detectors config (default: 'schema-detectors') */
  collectionSlug?: string;

  /** Add detector selection field to Datasets collection */
  extendDatasets?: boolean;

  /** Dataset collection slug to extend (default: 'datasets') */
  datasetsCollectionSlug?: string;
}

/**
 * Type for the schema detection Payload plugin function.
 */
export type SchemaDetectionPlugin = (options?: SchemaDetectionPluginOptions) => (config: Config) => Config;
