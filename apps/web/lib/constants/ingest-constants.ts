/**
 * Defines constants used throughout the data ingest processing system.
 *
 * This file centralizes constant values to prevent string duplication and provide a single
 * source of truth for statuses, stages, job types, and collection names related to the
 * ingest pipeline. This improves maintainability and reduces the risk of typos.
 *
 * @module
 */

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

export const BATCH_SIZES = {
  DUPLICATE_ANALYSIS: Number.parseInt(process.env.BATCH_SIZE_DUPLICATE_ANALYSIS ?? "5000", 10),
  SCHEMA_DETECTION: Number.parseInt(process.env.BATCH_SIZE_SCHEMA_DETECTION ?? "10000", 10),
  EVENT_CREATION: Number.parseInt(process.env.BATCH_SIZE_EVENT_CREATION ?? "1000", 10),
  DATABASE_CHUNK: Number.parseInt(process.env.BATCH_SIZE_DATABASE_CHUNK ?? "1000", 10),
} as const;

export type ProcessingStage = (typeof PROCESSING_STAGE)[keyof typeof PROCESSING_STAGE];
export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];
export type CollectionName = (typeof COLLECTION_NAMES)[keyof typeof COLLECTION_NAMES];
