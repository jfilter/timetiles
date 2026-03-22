/**
 * Typed output interfaces for Payload CMS workflow tasks.
 *
 * Each task handler returns `{ output: TaskOutput }` where the output
 * follows these contracts. Workflow handlers check `success` to decide
 * whether to continue or skip a sheet.
 *
 * Rules:
 * - `success: true` + data → workflow continues to next task
 * - `success: false` + reason → workflow handler decides (skip sheet, stop)
 * - Task throws → Payload retries (transient errors only)
 *
 * @module
 * @category Jobs
 */

/** Sheet info returned by dataset-detection for workflow orchestration. */
export interface SheetInfo {
  index: number;
  ingestJobId: number | string;
  name: string;
  rowCount: number;
}

/** Output from `dataset-detection` task. */
export interface DatasetDetectionOutput {
  success: boolean;
  sheetsDetected?: number;
  ingestJobsCreated?: number;
  sheets?: SheetInfo[];
  reason?: string;
}

/** Output from `analyze-duplicates` task. */
export interface AnalyzeDuplicatesOutput {
  success: boolean;
  totalRows?: number;
  uniqueRows?: number;
  internalDuplicates?: number;
  externalDuplicates?: number;
  skipped?: boolean;
  reason?: string;
}

/** Output from `detect-schema` task. */
export interface DetectSchemaOutput {
  success: boolean;
  fieldCount?: number;
  totalRowsProcessed?: number;
  reason?: string;
}

/** Output from `validate-schema` task. */
export interface ValidateSchemaOutput {
  success: boolean;
  requiresApproval?: boolean;
  hasBreakingChanges?: boolean;
  hasChanges?: boolean;
  newFields?: number;
  failed?: boolean;
  failureReason?: string;
  reason?: string;
}

/** Output from `create-schema-version` task. */
export interface CreateSchemaVersionOutput {
  success: boolean;
  schemaVersionId?: number | string;
  versionNumber?: number;
  skipped?: boolean;
  reason?: string;
}

/** Output from `geocode-batch` task. */
export interface GeocodeBatchOutput {
  success: boolean;
  totalRows?: number;
  uniqueLocations?: number;
  geocoded?: number;
  failed?: number;
  skipped?: boolean;
  reason?: string;
}

/** Output from `create-events-batch` task. */
export interface CreateEventsOutput {
  success: boolean;
  eventCount?: number;
  duplicatesSkipped?: number;
  errors?: number;
  reason?: string;
}

/** Output from `url-fetch` task. */
export interface UrlFetchOutput {
  success: boolean;
  ingestFileId?: number | string;
  reason?: string;
}

/** Output from `scraper-execution` task. */
export interface ScraperExecutionOutput {
  success: boolean;
  ingestFileId?: number | string;
  hasOutput?: boolean;
  reason?: string;
}
