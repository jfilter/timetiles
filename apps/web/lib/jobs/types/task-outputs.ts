/**
 * Typed output interfaces for Payload CMS workflow tasks.
 *
 * Each task handler returns `{ output: TaskOutput }` where the output
 * follows these contracts. The error model uses throw/needsReview:
 *
 * - Task returns data -> workflow continues to next task
 * - Task returns `{ needsReview: true }` -> workflow handler pauses for review
 * - Task throws -> Payload retries (transient errors), then onFail marks FAILED
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
  sheetsDetected?: number;
  ingestJobsCreated?: number;
  sheets?: SheetInfo[];
  reason?: string;
}

/** Output from `analyze-duplicates` task. */
export interface AnalyzeDuplicatesOutput {
  needsReview?: boolean;
  totalRows?: number;
  uniqueRows?: number;
  internalDuplicates?: number;
  externalDuplicates?: number;
  skipped?: boolean;
  reason?: string;
}

/** Output from `detect-schema` task. */
export interface DetectSchemaOutput {
  needsReview?: boolean;
  fieldCount?: number;
  totalRowsProcessed?: number;
  reason?: string;
}

/** Output from `validate-schema` task. */
export interface ValidateSchemaOutput {
  needsReview?: boolean;
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
  schemaVersionId?: number | string;
  versionNumber?: number;
  skipped?: boolean;
  reason?: string;
}

/** Output from `geocode-batch` task. */
export interface GeocodeBatchOutput {
  needsReview?: boolean;
  totalRows?: number;
  uniqueLocations?: number;
  geocoded?: number;
  failed?: number;
  skipped?: boolean;
  reason?: string;
}

/** Output from `create-events-batch` task. */
export interface CreateEventsOutput {
  needsReview?: boolean;
  eventCount?: number;
  duplicatesSkipped?: number;
  errors?: number;
  reason?: string;
}

/** Output from `url-fetch` task. */
export interface UrlFetchOutput {
  ingestFileId?: number | string;
  isDuplicate?: boolean;
  skippedReason?: string;
  reason?: string;
}

/** Output from `scraper-execution` task. */
export interface ScraperExecutionOutput {
  ingestFileId?: number | string;
  hasOutput?: boolean;
  reason?: string;
}
