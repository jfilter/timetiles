/**
 * Shared Payload Configuration Constants
 * 
 * This file contains shared configuration elements used by both the main
 * payload.config.ts and the payload-config-factory.ts to reduce duplication.
 */

// Import all collections
import Catalogs from "@/lib/collections/catalogs";
import DatasetSchemas from "@/lib/collections/dataset-schemas";
import Datasets from "@/lib/collections/datasets";
import Events from "@/lib/collections/events";
import GeocodingProviders from "@/lib/collections/geocoding-providers";
import ImportFiles from "@/lib/collections/import-files";
import ImportJobs from "@/lib/collections/import-jobs";
import LocationCache from "@/lib/collections/location-cache";
import Media from "@/lib/collections/media";
import { Pages } from "@/lib/collections/pages";
import Users from "@/lib/collections/users";

// Import globals
import { MainMenu } from "@/lib/globals/main-menu";

// Import jobs
import {
  analyzeDuplicatesJob,
  cleanupApprovalLocksJob,
  createEventsBatchJob,
  createSchemaVersionJob,
  datasetDetectionJob,
  geocodeBatchJob,
  schemaDetectionJob,
  validateSchemaJob,
} from "@/lib/jobs/import-jobs";

// Import migrations
import { migrations } from "@/migrations";

// Collection registry for easy access
export const COLLECTIONS = {
  catalogs: Catalogs,
  datasets: Datasets,
  "dataset-schemas": DatasetSchemas,
  "import-files": ImportFiles,
  "import-jobs": ImportJobs,
  events: Events,
  users: Users,
  media: Media,
  "location-cache": LocationCache,
  "geocoding-providers": GeocodingProviders,
  pages: Pages,
} as const;

export type CollectionName = keyof typeof COLLECTIONS;

// Ordered list of all collections for production
export const ALL_COLLECTIONS = [
  Catalogs,
  Datasets,
  DatasetSchemas,
  ImportFiles,
  ImportJobs,
  Events,
  Users,
  Media,
  LocationCache,
  GeocodingProviders,
  Pages,
];

// All globals
export const ALL_GLOBALS = [MainMenu];

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
];

// Default collections for different environments
export const DEFAULT_COLLECTIONS: Record<string, CollectionName[]> = {
  production: Object.keys(COLLECTIONS) as CollectionName[],
  test: [
    "users",
    "catalogs",
    "datasets",
    "events",
    "import-files",
    "import-jobs",
    "dataset-schemas",
    "geocoding-providers",
    "location-cache",
    "media",
  ] as CollectionName[],
  minimal: ["users"] as CollectionName[],
};

// Common upload configuration
export const DEFAULT_UPLOAD_CONFIG = {
  limits: {
    fileSize: 100000000, // 100MB
  },
  abortOnLimit: true,
  uploadTimeout: 600000, // 10 minutes
  useTempFiles: true,
  tempFileDir: process.env.UPLOAD_TEMP_DIR || "/tmp",
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