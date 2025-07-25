/**
 * Constants for import processing to avoid string duplication
 */

export const IMPORT_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  FAILED: "failed",
} as const;

export const PROCESSING_STAGE = {
  FILE_PARSING: "file-parsing",
  ROW_PROCESSING: "row-processing",
  GEOCODING: "geocoding",
  EVENT_CREATION: "event-creation",
  COMPLETED: "completed",
} as const;

export const JOB_TYPES = {
  FILE_PARSING: "file-parsing",
  BATCH_PROCESSING: "batch-processing",
  GEOCODING_BATCH: "geocoding-batch",
  EVENT_CREATION: "event-creation",
} as const;

export const COLLECTION_NAMES = {
  IMPORTS: "imports",
  EVENTS: "events",
  CATALOGS: "catalogs",
  DATASETS: "datasets",
} as const;

export type ImportStatus = (typeof IMPORT_STATUS)[keyof typeof IMPORT_STATUS];
export type ProcessingStage = (typeof PROCESSING_STAGE)[keyof typeof PROCESSING_STAGE];
export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES];
export type CollectionName = (typeof COLLECTION_NAMES)[keyof typeof COLLECTION_NAMES];
