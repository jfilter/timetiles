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
import { getEnv } from "@/lib/config/env";
// Import globals
import { Branding } from "@/lib/globals/branding";
import { Footer } from "@/lib/globals/footer";
import { MainMenu } from "@/lib/globals/main-menu";
import { Settings } from "@/lib/globals/settings";
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

// Largest file Payload's multipart parser accepts (REST and admin uploads), in the MiB unit of
// the maxFileSizeMB quotas so it matches the 100 MB file-size limit the quotas endpoint advertises.
export const MAX_UPLOAD_FILE_BYTES = 100 * 1024 * 1024;

// Common upload configuration
export const DEFAULT_UPLOAD_CONFIG = {
  // busboy aborts once a file reaches `fileSize`, so the largest accepted file is one byte below it.
  limits: { fileSize: MAX_UPLOAD_FILE_BYTES + 1 },
  // The whole multipart request (file plus form fields); Payload's default is 50 MiB.
  requestSizeLimit: MAX_UPLOAD_FILE_BYTES + 1024 * 1024,
  abortOnLimit: true,
  uploadTimeout: 600000, // 10 minutes
  useTempFiles: true,
  tempFileDir: getEnv().UPLOAD_TEMP_DIR,
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
