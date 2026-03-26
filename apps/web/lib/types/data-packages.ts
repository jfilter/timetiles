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

import type { AuthConfig, JsonApiScheduleConfig } from "./ingest-wizard";

// ---------------------------------------------------------------------------
// Manifest types (match YAML structure)
// ---------------------------------------------------------------------------

/** Source configuration for fetching data. */
export interface DataPackageSource {
  url: string;
  format: "json" | "csv";
  auth?: AuthConfig;
  jsonApi?: JsonApiScheduleConfig;
}

/** Catalog defaults created on activation. */
export interface DataPackageCatalog {
  name: string;
  description?: string;
  isPublic?: boolean;
}

/** Dataset defaults created on activation. */
export interface DataPackageDataset {
  name: string;
  language?: string;
  idStrategy?: {
    type: "external" | "content-hash" | "auto-generate";
    externalIdPath?: string;
    duplicateStrategy?: "skip" | "update" | "version";
  };
}

/** Field mapping configuration. */
export interface DataPackageFieldMappings {
  titlePath?: string;
  descriptionPath?: string;
  timestampPath?: string;
  endTimestampPath?: string;
  locationNamePath?: string;
  locationPath?: string;
  latitudePath?: string;
  longitudePath?: string;
}

/** Schedule configuration. */
export interface DataPackageSchedule {
  type: "frequency" | "cron";
  frequency?: "hourly" | "daily" | "weekly" | "monthly";
  cronExpression?: string;
  schemaMode?: "strict" | "additive" | "flexible";
  timezone?: string;
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

/** Full data package manifest as defined in YAML. */
export interface DataPackageManifest {
  slug: string;
  name: string;
  description: string;
  category: string;
  region?: string;
  tags: string[];
  license?: string;
  estimatedRecords?: number;
  source: DataPackageSource;
  catalog: DataPackageCatalog;
  dataset: DataPackageDataset;
  fieldMappings: DataPackageFieldMappings;
  schedule: DataPackageSchedule;
  reviewChecks?: DataPackageReviewChecks;
  geocodingBias?: DataPackageGeocodingBias;
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
