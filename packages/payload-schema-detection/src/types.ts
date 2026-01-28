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

// Re-export FieldStatistics type that detectors need
export interface FieldStatistics {
  path: string;
  occurrences: number;
  occurrencePercent: number;
  nullCount: number;
  uniqueValues: number;
  uniqueSamples: Array<string | number | boolean | null | Record<string, unknown>>;
  typeDistribution: Record<string, number>;
  formats: {
    email?: number;
    url?: number;
    dateTime?: number;
    date?: number;
    numeric?: number;
  };
  numericStats?: {
    min: number;
    max: number;
    avg: number;
    isInteger: boolean;
  };
  isEnumCandidate: boolean;
  enumValues?: Array<{ value: unknown; count: number; percent: number }>;
  geoHints?: {
    isLatitude: boolean;
    isLongitude: boolean;
    fieldNamePattern: string;
    valueRange: boolean;
  };
  firstSeen: Date;
  lastSeen: Date;
  depth: number;
}

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
  combined?: {
    path: string;
    format: "lat,lng" | "lng,lat" | "geojson" | "wkt" | string;
  };
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
