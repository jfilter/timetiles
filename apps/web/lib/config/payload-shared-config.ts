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
import Catalogs from "@/lib/collections/catalogs";
import DataExports from "@/lib/collections/data-exports";
import DatasetSchemas from "@/lib/collections/dataset-schemas";
import Datasets from "@/lib/collections/datasets";
import DeletionAuditLog from "@/lib/collections/deletion-audit-log";
import Events from "@/lib/collections/events";
import GeocodingProviders from "@/lib/collections/geocoding-providers";
import ImportFiles from "@/lib/collections/import-files";
import ImportJobs from "@/lib/collections/import-jobs/";
import LocationCache from "@/lib/collections/location-cache";
import Media from "@/lib/collections/media";
import { Pages } from "@/lib/collections/pages";
import ScheduledImports from "@/lib/collections/scheduled-imports/index";
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
  cacheCleanupJob,
  cleanupApprovalLocksJob,
  cleanupStuckScheduledImportsJob,
  createEventsBatchJob,
  createSchemaVersionJob,
  dataExportCleanupJob,
  dataExportJob,
  datasetDetectionJob,
  geocodeBatchJob,
  processPendingRetriesJob,
  quotaResetJobConfig,
  scheduleManagerJob,
  schemaDetectionJob,
  schemaMaintenanceJob,
  urlFetchJob,
  validateSchemaJob,
} from "@/lib/jobs/import-jobs";
// Import migrations
import { migrations } from "@/migrations";

// Collection registry for easy access
export const COLLECTIONS = {
  catalogs: Catalogs,
  "data-exports": DataExports,
  datasets: Datasets,
  "dataset-schemas": DatasetSchemas,
  "deletion-audit-log": DeletionAuditLog,
  "import-files": ImportFiles,
  "import-jobs": ImportJobs,
  "scheduled-imports": ScheduledImports,
  events: Events,
  users: Users,
  "user-usage": UserUsage,
  media: Media,
  "location-cache": LocationCache,
  "geocoding-providers": GeocodingProviders,
  pages: Pages,
  views: Views,
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

// Ordered list of all collections for production
// Grouped: Data, Import, Content, System
export const ALL_COLLECTIONS = [
  // Data
  Catalogs,
  Datasets,
  DatasetSchemas,
  Events,
  // Import
  ImportFiles,
  ImportJobs,
  ScheduledImports,
  // Content
  Pages,
  Media,
  // System
  Users,
  UserUsage,
  GeocodingProviders,
  LocationCache,
  DeletionAuditLog,
  DataExports,
  // Configuration
  Views,
];

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
  cleanupApprovalLocksJob,
  urlFetchJob,
  scheduleManagerJob,
  cleanupStuckScheduledImportsJob,
  processPendingRetriesJob,
  quotaResetJobConfig,
  cacheCleanupJob,
  schemaMaintenanceJob,
  dataExportJob,
  dataExportCleanupJob,
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
  transactionOptions: {
    isolationLevel: "read committed" as const,
  },
};

// TypeScript configuration
export const DEFAULT_TYPESCRIPT_CONFIG = {
  outputFile: "./payload-types.ts",
};
