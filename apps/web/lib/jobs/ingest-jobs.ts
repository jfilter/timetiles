/**
 * Centralized export point for all import-related job handlers and types.
 *
 * This file serves as a barrel, aggregating and re-exporting the various components
 * of the import job system. This simplifies imports in other parts of the application,
 * such as the Payload configuration where jobs are registered.
 *
 * @module
 */
import { analyzeDuplicatesJob } from "./handlers/analyze-duplicates-job";
import { auditLogIpCleanupJob } from "./handlers/audit-log-ip-cleanup-job";
import { cacheCleanupJob } from "./handlers/cache-cleanup-job";
import { cleanupStuckScheduledIngestsJob } from "./handlers/cleanup-stuck-scheduled-ingests-job";
import { cleanupStuckScrapersJob } from "./handlers/cleanup-stuck-scrapers-job";
import { createEventsBatchJob } from "./handlers/create-events-batch-job";
import { createSchemaVersionJob } from "./handlers/create-schema-version-job";
import { dataExportCleanupJob } from "./handlers/data-export-cleanup-job";
import { dataExportJob } from "./handlers/data-export-job";
import { datasetDetectionJob } from "./handlers/dataset-detection-job";
import { executeAccountDeletionJob } from "./handlers/execute-account-deletion-job";
import { geocodeBatchJob } from "./handlers/geocode-batch-job";
import { ingestFilesCleanupJob } from "./handlers/ingest-files-cleanup-job";
import { jobCleanupJob } from "./handlers/job-cleanup-job";
import { previewCleanupJob } from "./handlers/preview-cleanup-job";
import { quotaResetJobConfig } from "./handlers/quota-reset-job";
import { rateLimitCleanupJob } from "./handlers/rate-limit-cleanup-job";
import { scheduleManagerJob } from "./handlers/schedule-manager-job";
import { schemaDetectionJob } from "./handlers/schema-detection-job";
import { schemaMaintenanceJob } from "./handlers/schema-maintenance-job";
import { scraperExecutionJob } from "./handlers/scraper-execution-job";
import { scraperRepoSyncJob } from "./handlers/scraper-repo-sync-job";
import { sendEmailJob } from "./handlers/send-email-job";
import { urlFetchJob } from "./handlers/url-fetch-job";
import { validateSchemaJob } from "./handlers/validate-schema-job";

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
export { rateLimitCleanupJob } from "./handlers/rate-limit-cleanup-job";

// Cache management job handlers
export { cacheCleanupJob } from "./handlers/cache-cleanup-job";

// Preview cleanup job handler
export { previewCleanupJob } from "./handlers/preview-cleanup-job";

// Ingest-file cleanup job handler
export { ingestFilesCleanupJob } from "./handlers/ingest-files-cleanup-job";

// Schema maintenance job handlers
export { schemaMaintenanceJob } from "./handlers/schema-maintenance-job";

// Data export job handlers
export { dataExportCleanupJob } from "./handlers/data-export-cleanup-job";
export { dataExportJob } from "./handlers/data-export-job";
export { sendEmailJob } from "./handlers/send-email-job";

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

/**
 * Every job handler, in registration order.
 *
 * Owned HERE rather than in payload-shared-config: a handler that is exported
 * but not registered compiles fine and its `jobs.queue()` call sites type-check,
 * yet Payload never runs the task. One list, one place to forget nothing.
 */
export const ALL_JOBS = [
  datasetDetectionJob,
  schemaDetectionJob,
  analyzeDuplicatesJob,
  validateSchemaJob,
  createSchemaVersionJob,
  geocodeBatchJob,
  createEventsBatchJob,
  urlFetchJob,
  scheduleManagerJob,
  cleanupStuckScheduledIngestsJob,
  cleanupStuckScrapersJob,
  quotaResetJobConfig,
  rateLimitCleanupJob,
  cacheCleanupJob,
  previewCleanupJob,
  ingestFilesCleanupJob,
  schemaMaintenanceJob,
  dataExportJob,
  dataExportCleanupJob,
  sendEmailJob,
  auditLogIpCleanupJob,
  executeAccountDeletionJob,
  scraperExecutionJob,
  scraperRepoSyncJob,
  jobCleanupJob,
];
