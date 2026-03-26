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
export { createEventsBatchJob } from "./handlers/create-events-batch-job";
export { createSchemaVersionJob } from "./handlers/create-schema-version-job";
export { datasetDetectionJob } from "./handlers/dataset-detection-job";
export { geocodeBatchJob } from "./handlers/geocode-batch-job";
export { schemaDetectionJob } from "./handlers/schema-detection-job";
export { validateSchemaJob } from "./handlers/validate-schema-job";

// URL and scheduling job handlers
export { cleanupStuckScheduledIngestsJob } from "./handlers/cleanup-stuck-scheduled-ingests-job";
export { cleanupStuckScrapersJob } from "./handlers/cleanup-stuck-scrapers-job";
export { scheduleManagerJob } from "./handlers/schedule-manager-job";
export { urlFetchJob } from "./handlers/url-fetch-job";

// Quota management job handlers
export { quotaResetJobConfig } from "./handlers/quota-reset-job";

// Cache management job handlers
export { cacheCleanupJob } from "./handlers/cache-cleanup-job";

// Schema maintenance job handlers
export { schemaMaintenanceJob } from "./handlers/schema-maintenance-job";

// Data export job handlers
export { dataExportCleanupJob } from "./handlers/data-export-cleanup-job";
export { dataExportJob } from "./handlers/data-export-job";

// Audit log job handlers
export { auditLogIpCleanupJob } from "./handlers/audit-log-ip-cleanup-job";

// Job cleanup handler
export { jobCleanupJob } from "./handlers/job-cleanup-job";

// Account management job handlers
export { executeAccountDeletionJob } from "./handlers/execute-account-deletion-job";

// Scraper job handlers
export { scraperExecutionJob } from "./handlers/scraper-execution-job";
export { scraperRepoSyncJob } from "./handlers/scraper-repo-sync-job";

// Re-export utility types
export type {
  AnalyzeDuplicatesJobInput,
  BatchJobInput,
  CreateEventsBatchJobInput,
  CreateSchemaVersionJobInput,
  DatasetDetectionJobInput,
  GeocodingBatchJobInput,
  IngestJobInput,
  SchemaDetectionJobInput,
  ValidateSchemaJobInput,
} from "./types/job-inputs";
// Note: Job queue functions have been removed to avoid circular dependencies
// To queue jobs, use payload.jobs.queue() directly from your API routes or other contexts
// where you have access to the payload instance
