/**
 * Registration list of all job handlers for the Payload configuration.
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
