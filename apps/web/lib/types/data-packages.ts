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
