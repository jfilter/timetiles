/**
 * Defines constants used throughout the data import processing system.
 *
 * This file centralizes constant values to prevent string duplication and provide a single
 * source of truth for statuses, stages, job types, and collection names related to the
 * import pipeline. This improves maintainability and reduces the risk of typos.
 *
 * @module
 */

/**
 * Constants for import processing to avoid string duplication.
 */

export const IMPORT_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export const PROCESSING_STAGE = {
  ANALYZE_DUPLICATES: "analyze-duplicates",
  DETECT_SCHEMA: "detect-schema",
  VALIDATE_SCHEMA: "validate-schema",
  AWAIT_APPROVAL: "await-approval",
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
  IMPORT_FILES: "import-files",
  IMPORT_JOBS: "import-jobs",
  EVENTS: "events",
  CATALOGS: "catalogs",
  DATASETS: "datasets",
  DATASET_SCHEMAS: "dataset-schemas",
  GEOCODING_PROVIDERS: "geocoding-providers",
  SCHEDULED_IMPORTS: "scheduled-imports",
  USERS: "users",
  PAYLOAD_MIGRATIONS: "payload-migrations",
} as const;

export const BATCH_SIZES = {
  DUPLICATE_ANALYSIS: 5000, // Memory efficient for duplicate detection
  SCHEMA_DETECTION: 10000, // Larger batches for schema building efficiency
  SCHEMA_VALIDATION: 10000, // Consistent with schema detection
  GEOCODING: 100, // Small to respect API rate limits
  EVENT_CREATION: 1000, // Smaller to avoid transaction timeouts
} as const;

export type ImportStatus = (typeof IMPORT_STATUS)[keyof typeof IMPORT_STATUS];
export type ProcessingStage = (typeof PROCESSING_STAGE)[keyof typeof PROCESSING_STAGE];
export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];
export type CollectionName = (typeof COLLECTION_NAMES)[keyof typeof COLLECTION_NAMES];
