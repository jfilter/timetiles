/**
 * Shared Payload CMS configuration constants and utilities.
 *
 * Provides centralized configuration elements used across both production
 * and test Payload configurations. Includes collection definitions, globals,
 * plugins, and common configuration options to ensure consistency.
 *
 * @module
 * @category Configuration
 */

// Import all collections
import AuditLog from "@/lib/collections/audit-log";
import Catalogs from "@/lib/collections/catalogs";
import DataExports from "@/lib/collections/data-exports";
import DatasetSchemas from "@/lib/collections/dataset-schemas";
import Datasets from "@/lib/collections/datasets";
import Events from "@/lib/collections/events";
import GeocodingProviders from "@/lib/collections/geocoding-providers";
import IngestFiles from "@/lib/collections/ingest-files";
import IngestJobs from "@/lib/collections/ingest-jobs/";
import { LayoutTemplates } from "@/lib/collections/layout-templates";
import LocationCache from "@/lib/collections/location-cache";
import Media from "@/lib/collections/media";
import { Pages } from "@/lib/collections/pages";
import ScheduledIngests from "@/lib/collections/scheduled-ingests/index";
import ScraperRepos from "@/lib/collections/scraper-repos";
import ScraperRuns from "@/lib/collections/scraper-runs";
import Scrapers from "@/lib/collections/scrapers";
import Sites from "@/lib/collections/sites";
import { Themes } from "@/lib/collections/themes";
import UserUsage from "@/lib/collections/user-usage";
import Users from "@/lib/collections/users";
import Views from "@/lib/collections/views";
// Import globals
import { Branding } from "@/lib/globals/branding";
import { Footer } from "@/lib/globals/footer";
import { MainMenu } from "@/lib/globals/main-menu";
import { Settings } from "@/lib/globals/settings";
// Import jobs
import {
  analyzeDuplicatesJob,
  auditLogIpCleanupJob,
  cacheCleanupJob,
  cleanupStuckScheduledIngestsJob,
  cleanupStuckScrapersJob,
  createEventsBatchJob,
  createSchemaVersionJob,
  dataExportCleanupJob,
  dataExportJob,
  datasetDetectionJob,
  executeAccountDeletionJob,
  geocodeBatchJob,
  processPendingRetriesJob,
  quotaResetJobConfig,
  scheduleManagerJob,
  schemaDetectionJob,
  schemaMaintenanceJob,
  scraperExecutionJob,
  scraperRepoSyncJob,
  urlFetchJob,
  validateSchemaJob,
} from "@/lib/jobs/ingest-jobs";
// Import migrations
import { migrations } from "@/migrations";

// Collection registry for easy access
export const COLLECTIONS = {
  catalogs: Catalogs,
  "data-exports": DataExports,
  datasets: Datasets,
  "dataset-schemas": DatasetSchemas,
  "audit-log": AuditLog,
  "ingest-files": IngestFiles,
  "ingest-jobs": IngestJobs,
  "scheduled-ingests": ScheduledIngests,
  "scraper-repos": ScraperRepos,
  scrapers: Scrapers,
  "scraper-runs": ScraperRuns,
  events: Events,
  users: Users,
  "user-usage": UserUsage,
  media: Media,
  "location-cache": LocationCache,
  "geocoding-providers": GeocodingProviders,
  pages: Pages,
  sites: Sites,
  themes: Themes,
  "layout-templates": LayoutTemplates,
  views: Views,
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

// All globals (grouped: Content, System)
export const ALL_GLOBALS = [MainMenu, Footer, Branding, Settings];

// All jobs
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
  processPendingRetriesJob,
  quotaResetJobConfig,
  cacheCleanupJob,
  schemaMaintenanceJob,
  dataExportJob,
  dataExportCleanupJob,
  auditLogIpCleanupJob,
  executeAccountDeletionJob,
  scraperExecutionJob,
  scraperRepoSyncJob,
];

// Common upload configuration
export const DEFAULT_UPLOAD_CONFIG = {
  limits: {
    fileSize: 100000000, // 100MB
  },
  abortOnLimit: true,
  uploadTimeout: 600000, // 10 minutes
  useTempFiles: true,
  tempFileDir: process.env.UPLOAD_TEMP_DIR ?? "/tmp",
  safeFileNames: true,
  preserveExtension: 4,
};

// Common database configuration
export const DEFAULT_DB_CONFIG = {
  push: false,
  schemaName: "payload",
  migrationDir: "./migrations",
  prodMigrations: migrations,
  transactionOptions: { isolationLevel: "read committed" as const },
};

// TypeScript configuration
export const DEFAULT_TYPESCRIPT_CONFIG = { outputFile: "./payload-types.ts" };
