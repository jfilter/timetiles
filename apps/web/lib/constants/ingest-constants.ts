/**
 * Defines constants used throughout the data ingest processing system.
 *
 * This file centralizes constant values to prevent string duplication and provide a single
 * source of truth for statuses, stages, job types, and collection names related to the
 * ingest pipeline. This improves maintainability and reduces the risk of typos.
 *
 * Batch sizes are loaded from `config/timetiles.yml` (if present) with env var overrides
 * and hardcoded defaults as fallback. See {@link getAppConfig} for details.
 *
 * @module
 */
import { getAppConfig } from "@/lib/config/app-config";
import type { IngestFile } from "@/payload-types";

/**
 * Constants for ingest processing to avoid string duplication.
 */

export const PROCESSING_STAGE = {
  ANALYZE_DUPLICATES: "analyze-duplicates",
  DETECT_SCHEMA: "detect-schema",
  VALIDATE_SCHEMA: "validate-schema",
  NEEDS_REVIEW: "needs-review",
  CREATE_SCHEMA_VERSION: "create-schema-version",
  GEOCODE_BATCH: "geocode-batch",
  CREATE_EVENTS: "create-events",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export const JOB_TYPES = {
  DATASET_DETECTION: "dataset-detection",
  ANALYZE_DUPLICATES: "analyze-duplicates",
  DETECT_SCHEMA: "detect-schema",
  VALIDATE_SCHEMA: "validate-schema",
  CREATE_SCHEMA_VERSION: "create-schema-version",
  GEOCODE_BATCH: "geocode-batch",
  CREATE_EVENTS: "create-events",
  URL_FETCH: "url-fetch",
  SCHEDULE_MANAGER: "schedule-manager",
  CACHE_CLEANUP: "cache-cleanup",
} as const;

export const COLLECTION_NAMES = {
  INGEST_FILES: "ingest-files",
  INGEST_JOBS: "ingest-jobs",
  EVENTS: "events",
  CATALOGS: "catalogs",
  DATASETS: "datasets",
  DATASET_SCHEMAS: "dataset-schemas",
  GEOCODING_PROVIDERS: "geocoding-providers",
  SCHEDULED_INGESTS: "scheduled-ingests",
  USERS: "users",
  PAYLOAD_MIGRATIONS: "payload-migrations",
} as const;

const appBatchSizes = getAppConfig().batchSizes;

export const BATCH_SIZES = {
  DUPLICATE_ANALYSIS: appBatchSizes.duplicateAnalysis,
  SCHEMA_DETECTION: appBatchSizes.schemaDetection,
  EVENT_CREATION: appBatchSizes.eventCreation,
  DATABASE_CHUNK: appBatchSizes.databaseChunk,
} as const;

/**
 * Maximum number of unique rows tracked per sheet during duplicate analysis.
 *
 * Guards against heap exhaustion on extremely large files (tall-narrow CSVs that
 * survive our upload size cap but produce millions of unique IDs). When exceeded
 * the job surfaces a `FILE_TOO_LARGE` review so the user sees a clean message
 * instead of a 500 / OOM crash.
 */
export const MAX_UNIQUE_ROWS_PER_SHEET = 2_000_000;

/**
 * Maximum per-event JSONB payload size (sourceData + transformedData) in bytes.
 *
 * Guards against wide CSV rows / deeply nested GeoJSON blowing out TOAST pages
 * and inflating row sizes to the point where bulk inserts stall. Rows that
 * exceed this cap are recorded as per-row errors and skipped rather than
 * aborting the batch.
 */
export const MAX_EVENT_PAYLOAD_BYTES = 256 * 1024;

export type ProcessingStage = (typeof PROCESSING_STAGE)[keyof typeof PROCESSING_STAGE];
export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];
export type CollectionName = (typeof COLLECTION_NAMES)[keyof typeof COLLECTION_NAMES];

/** Lifecycle status of an ingest file — derived from the Payload collection. */
export type IngestFileStatus = NonNullable<IngestFile["status"]>;
