import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { buildConfig } from "payload";
import sharp from "sharp";

import Catalogs from "./lib/collections/catalogs";
import DatasetSchemas from "./lib/collections/dataset-schemas";
import Datasets from "./lib/collections/datasets";
import Events from "./lib/collections/events";
import GeocodingProviders from "./lib/collections/geocoding-providers";
import ImportFiles from "./lib/collections/import-files";
import ImportJobs from "./lib/collections/import-jobs";
import LocationCache from "./lib/collections/location-cache";
import Media from "./lib/collections/media";
import { Pages } from "./lib/collections/pages";
import Users from "./lib/collections/users";
import { MainMenu } from "./lib/globals/main-menu";
import {
  analyzeDuplicatesJob,
  cleanupApprovalLocksJob,
  createEventsBatchJob,
  createSchemaVersionJob,
  datasetDetectionJob,
  geocodeBatchJob,
  schemaDetectionJob,
  validateSchemaJob,
} from "./lib/jobs/import-jobs";

const secret = process.env.PAYLOAD_SECRET;
const serverURL = process.env.NEXT_PUBLIC_PAYLOAD_URL;
const connectionString = process.env.DATABASE_URL;

if (!secret) {
  throw new Error("PAYLOAD_SECRET environment variable is required");
}

if (!serverURL) {
  throw new Error("NEXT_PUBLIC_PAYLOAD_URL environment variable is required");
}

if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is required");
}

export default buildConfig({
  admin: {
    user: Users.slug,
  },
  collections: [
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
  ],
  globals: [MainMenu],
  jobs: {
    tasks: [
      // New simplified import pipeline jobs
      datasetDetectionJob,
      schemaDetectionJob,
      analyzeDuplicatesJob,
      validateSchemaJob,
      createSchemaVersionJob,
      geocodeBatchJob,
      createEventsBatchJob,
      // Maintenance jobs
      cleanupApprovalLocksJob,
    ],
  },
  editor: lexicalEditor({}),
  secret,
  serverURL,
  typescript: {
    outputFile: "./payload-types.ts",
  },
  db: postgresAdapter({
    push: false, // Disable automatic schema updates
    pool: {
      connectionString: connectionString,
    },
    schemaName: "payload",
    migrationDir: "./migrations",
    transactionOptions: {
      isolationLevel: "read committed",
    },
  }),
  cors: [serverURL],
  csrf: [serverURL],
  sharp: sharp as any,
  upload: {
    limits: {
      fileSize: 100000000, // 100MB global limit for large import files
    },
    abortOnLimit: true, // Return HTTP 413 for files exceeding limits
    uploadTimeout: 600000, // 10 minutes timeout for large file uploads
    useTempFiles: true, // Use temp files instead of memory for large files
    tempFileDir: process.env.UPLOAD_TEMP_DIR!,
    safeFileNames: true, // Strip dangerous characters from filenames
    preserveExtension: 4, // Max 4 characters for file extensions (.xlsx, .json, .csv, etc.)
  },
  graphQL: {
    disable: true,
  },
});
