/**
 * Types for the data packages system.
 *
 * Data packages are curated, pre-configured data sources defined as YAML
 * manifests. Users can activate a package to auto-create a catalog, dataset,
 * and scheduled ingest with one click.
 *
 * @module
 * @category Types
 */

import type { FieldPathMappings } from "@/lib/definitions/field-registry";
import type { StringOperation, TransformType } from "@/lib/definitions/transform-registry";
import type { AuthConfig, JsonApiScheduleConfig } from "@/lib/ingest/types/wizard";

// ---------------------------------------------------------------------------
// Manifest types (match YAML structure)
// ---------------------------------------------------------------------------

/** Configuration for extracting nested JSON paths into flat fields. */
export interface DataPackageExtractField {
  /** Dot-path to extract (e.g., "locations.0.geography.coordinates.1"). */
  from: string;
  /** Target flat field name (e.g., "latitude"). */
  to: string;
  /** For arrays of objects: extract this sub-path from each element and join. */
  joinPath?: string;
  /** Join separator (default: ", "). */
  separator?: string;
}

/** Pre-processing configuration for JSON records before CSV conversion. */
export interface DataPackagePreProcessing {
  /** Field to group records by (e.g. "uid"). */
  groupBy?: string;
  /** Fields to merge with min/max strategy (e.g. { startDate: "min", endDate: "max" }). */
  mergeFields?: Record<string, "min" | "max">;
  /** Extract nested JSON paths into flat top-level fields before flattening. */
  extractFields?: DataPackageExtractField[];
}

/** A single field to extract from each HTML record element. */
export interface DataPackageHtmlFieldDef {
  /** Output column name. */
  name: string;
  /** CSS selector relative to the record element. Empty or omitted = the record element itself. */
  selector?: string;
  /** HTML attribute to read. Omit to extract text content. */
  attribute?: string;
}

/** A field to extract from a detail page. */
export interface DataPackageDetailPageFieldDef {
  name: string;
  selector: string;
  attribute?: string;
  /** Regex pattern to extract from the element's text (first match). */
  pattern?: string;
}

/** Configuration for fetching detail pages to enrich records. */
export interface DataPackageDetailPage {
  /** Which record field contains the detail page URL. */
  urlField: string;
  /** Delay in ms between detail page requests. Default: 500. */
  rateLimitMs?: number;
  fields: DataPackageDetailPageFieldDef[];
}

/** Configuration for extracting records from HTML embedded in a JSON response. */
export interface DataPackageHtmlExtract {
  /** Dot-path to the HTML string inside the JSON response (e.g. "html"). */
  htmlPath: string;
  /** CSS selector that matches each record element (e.g. "article.card"). */
  recordSelector: string;
  /** Field definitions describing what to extract from each record element. */
  fields: DataPackageHtmlFieldDef[];
  /** Optional: fetch each record's detail page to extract additional fields. */
  detailPage?: DataPackageDetailPage;
}

/** Source configuration for fetching data. */
export interface DataPackageSource {
  url: string;
  format: "json" | "csv" | "html-in-json";
  auth?: AuthConfig;
  jsonApi?: JsonApiScheduleConfig;
  preProcessing?: DataPackagePreProcessing;
  /** Fields to exclude from import (removed before CSV conversion). */
  excludeFields?: string[];
  /** HTML extraction config (required when format is "html-in-json"). */
  htmlExtract?: DataPackageHtmlExtract;
}

/** Publisher metadata (FtM-compatible). Lives on catalog, optional override on dataset. */
export interface DataPackagePublisher {
  name: string;
  url?: string;
  acronym?: string;
  description?: string;
  /** ISO 3166-1 alpha-2 country code. */
  country?: string;
  /** True if publisher is a government or inter-governmental organization. */
  official?: boolean;
}

/** Coverage metadata (FtM-compatible). */
export interface DataPackageCoverage {
  /** ISO 3166-1 alpha-2 country codes. */
  countries?: string[];
  /** Dataset start date (YYYY-MM-DD). */
  start?: string;
}

/** Catalog defaults created on activation. */
export interface DataPackageCatalog {
  name: string;
  description?: string;
  isPublic?: boolean;
  license?: string;
  sourceUrl?: string;
  category?: string;
  region?: string;
  tags?: string[];
  publisher?: DataPackagePublisher;
}

/** Dataset defaults created on activation. */
export interface DataPackageDataset {
  name: string;
  language?: string;
  license?: string;
  sourceUrl?: string;
  idStrategy?: {
    type: "external" | "content-hash" | "auto-generate";
    externalIdPath?: string;
    duplicateStrategy?: "skip" | "update" | "version";
  };
  publisher?: DataPackagePublisher;
  coverage?: DataPackageCoverage;
}

/**
 * Field mapping configuration.
 *
 * Derived from the canonical field registry. All paths are optional
 * since data packages may not map every field.
 */
export type DataPackageFieldMappings = Partial<FieldPathMappings>;

/** Schedule configuration. */
export interface DataPackageSchedule {
  type: "frequency" | "cron";
  frequency?: "hourly" | "daily" | "weekly" | "monthly";
  cronExpression?: string;
  schemaMode?: "strict" | "additive" | "flexible";
  timezone?: string;
}

/** Transform rule for data package imports. */
export interface DataPackageTransform {
  type: TransformType;
  from?: string;
  to?: string;
  delimiter?: string;
  toFields?: string[];
  inputFormat?: string;
  outputFormat?: string;
  timezone?: string;
  operation?: StringOperation;
  pattern?: string;
  replacement?: string;
  expression?: string;
  fromFields?: string[];
  separator?: string;
  /** Regex capture group index for extract transforms (default: 1). */
  group?: number;
}

/** Data quality review check overrides. */
export interface DataPackageReviewChecks {
  skipTimestampCheck?: boolean;
  skipLocationCheck?: boolean;
  skipEmptyRowCheck?: boolean;
  skipRowErrorCheck?: boolean;
  skipDuplicateRateCheck?: boolean;
  skipGeocodingCheck?: boolean;
}

/** Geocoding region bias to improve accuracy. */
export interface DataPackageGeocodingBias {
  /** ISO 3166-1 alpha-2 country codes (e.g. ["ua", "pl"]). */
  countryCodes?: string[];
  /** Bounding box to prefer results within a geographic area. */
  viewBox?: { minLon: number; minLat: number; maxLon: number; maxLat: number };
  /** Strictly restrict results to the view box. */
  bounded?: boolean;
}

/** Parameter definition for parametric data packages. */
export interface DataPackageParameter {
  /** Parameter name used in `{{name}}` template placeholders. */
  name: string;
  /** Human-readable label for CLI/UI display. */
  label: string;
  /** Whether the parameter must be provided at activation time. */
  required?: boolean;
  /** Example value shown in help output. */
  example?: string;
}

/** Setup instructions for data packages requiring external credentials. */
export interface DataPackageSetup {
  /** Step-by-step instructions for obtaining credentials. */
  instructions: string;
  /** URL for registration or documentation. */
  url?: string;
  /** Environment variable names that must be set. */
  envVars: string[];
}

/** Full data package manifest as defined in YAML. */
export interface DataPackageManifest {
  slug: string;
  title: string;
  summary: string;
  /** Detailed description (markdown). */
  description?: string;
  category: string;
  region?: string;
  tags: string[];
  license?: string;
  estimatedRecords?: number;
  /** Reference or homepage URL for the data package. */
  url?: string;
  /** Top-level publisher metadata (FtM-compatible). Maps to catalog publisher. */
  publisher?: DataPackagePublisher;
  /** Coverage metadata (FtM-compatible). */
  coverage?: DataPackageCoverage;
  source: DataPackageSource;
  catalog: DataPackageCatalog;
  dataset: DataPackageDataset;
  fieldMappings: DataPackageFieldMappings;
  transforms?: DataPackageTransform[];
  schedule: DataPackageSchedule;
  reviewChecks?: DataPackageReviewChecks;
  geocodingBias?: DataPackageGeocodingBias;
  parameters?: DataPackageParameter[];
  setup?: DataPackageSetup;
}

/** Activation state for a data package. */
export interface DataPackageActivation {
  scheduledIngestId: number;
  catalogId: number;
  datasetId: number;
  enabled: boolean;
}

/** Data package with activation status for API responses. */
export interface DataPackageListItem extends DataPackageManifest {
  activated: boolean;
  activation?: DataPackageActivation;
}
