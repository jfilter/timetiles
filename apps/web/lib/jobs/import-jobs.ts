/**
 * Centralized export point for all import-related job handlers and types.
 *
 * This file serves as a barrel, aggregating and re-exporting the various components
 * of the import job system. This simplifies imports in other parts of the application,
 * such as the Payload configuration where jobs are registered.
 *
 * @module
 */
// New simplified job handlers
export { analyzeDuplicatesJob } from "./handlers/analyze-duplicates-job";
export { cleanupApprovalLocksJob } from "./handlers/cleanup-approval-locks-job";
export { createEventsBatchJob } from "./handlers/create-events-batch-job";
export { createSchemaVersionJob } from "./handlers/create-schema-version-job";
export { datasetDetectionJob } from "./handlers/dataset-detection-job";
export { geocodeBatchJob } from "./handlers/geocode-batch-job";
export { schemaDetectionJob } from "./handlers/schema-detection-job";
export { validateSchemaJob } from "./handlers/validate-schema-job";

// URL and scheduling job handlers
export { cleanupStuckScheduledImportsJob } from "./handlers/cleanup-stuck-scheduled-imports-job";
export { scheduleManagerJob } from "./handlers/schedule-manager-job";
export { urlFetchJob } from "./handlers/url-fetch-job";

// Quota management job handlers
export { quotaResetJobConfig } from "./handlers/quota-reset-job";

// Re-export utility types
export type {
  AnalyzeDuplicatesJobInput,
  BatchJobInput,
  CreateEventsBatchJobInput,
  CreateSchemaVersionJobInput,
  DatasetDetectionJobInput,
  GeocodingBatchJobInput,
  ImportJobInput,
  SchemaDetectionJobInput,
  ValidateSchemaJobInput,
} from "./types/job-inputs";
export type { JobHandlerContext } from "./utils/job-context";

// Note: Job queue functions have been removed to avoid circular dependencies
// To queue jobs, use payload.jobs.queue() directly from your API routes or other contexts
// where you have access to the payload instance
