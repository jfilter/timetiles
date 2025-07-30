// Vitest setup file
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import { logger } from "@/lib/logger";

import { createTestDatabase } from "./database-setup";
import { verifyDatabaseSchema } from "./verify-schema";

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}
process.env.PAYLOAD_SECRET = "test-secret-key";
process.env.NEXT_PUBLIC_PAYLOAD_URL = "http://localhost:3000";

// Payload logging is now properly controlled via logger and loggingLevels configuration

// Create isolated test database for each worker
const workerId = process.env.VITEST_WORKER_ID ?? "1";
const testDbName = `timetiles_test_${workerId}`;
const dbUrl = `postgresql://timetiles_user:timetiles_password@localhost:5432/${testDbName}`;
process.env.DATABASE_URL = dbUrl;

// Create unique temp directory for each test worker
const tempDir = `/tmp/timetiles-test-${workerId}-${randomUUID()}`;
process.env.TEMP_DIR = tempDir;

process.env.UPLOAD_DIR_MEDIA = `/tmp/media`;
process.env.UPLOAD_DIR_IMPORT_FILES = `/tmp/import-files`;
process.env.UPLOAD_TEMP_DIR = `/tmp/temp`;

// Global setup to ensure clean test environment
beforeAll(async () => {
  if (process.env.LOG_LEVEL && process.env.LOG_LEVEL !== "silent") {
    logger.info(`Setting up test environment for worker ${workerId}`);
  }

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Ensure upload directories exist
  const uploadDirs = [
    process.env.UPLOAD_DIR_MEDIA!,
    process.env.UPLOAD_DIR_IMPORT_FILES!,
    process.env.UPLOAD_TEMP_DIR!,
  ];

  uploadDirs.forEach((dir) => {
    const fullPath = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });

  // Create test database if it doesn't exist (includes PostGIS setup)
  await createTestDatabase(testDbName);

  // Run migrations to ensure database schema is up to date
  try {
    const { getPayload, buildConfig } = await import("payload");
    const { postgresAdapter } = await import("@payloadcms/db-postgres");
    const { lexicalEditor } = await import("@payloadcms/richtext-lexical");
    const { migrations } = await import("../../migrations");

    // Import all collections to ensure proper migration
    const Catalogs = (await import("../../lib/collections/catalogs")).default;
    const Datasets = (await import("../../lib/collections/datasets")).default;
    const ImportFiles = (await import("../../lib/collections/import-files")).default;
    const ImportJobs = (await import("../../lib/collections/import-jobs")).default;
    // ImportDatasets collection was removed
    // ImportSchemaBuilders collection was removed
    const DatasetSchemas = (await import("../../lib/collections/dataset-schemas")).default;
    const Events = (await import("../../lib/collections/events")).default;
    const Users = (await import("../../lib/collections/users")).default;
    const Media = (await import("../../lib/collections/media")).default;
    const LocationCache = (await import("../../lib/collections/location-cache")).default;
    const GeocodingProviders = (await import("../../lib/collections/geocoding-providers")).default;
    const { Pages } = await import("../../lib/collections/pages");
    const { MainMenu } = await import("../../lib/globals/main-menu");
    const {
      analyzeDuplicatesJob,
      cleanupApprovalLocksJob,
      createEventsBatchJob,
      createSchemaVersionJob,
      datasetDetectionJob,
      geocodeBatchJob,
      schemaDetectionJob,
      validateSchemaJob,
    } = await import("../../lib/jobs/import-jobs");

    const testConfig = buildConfig({
      secret: process.env.PAYLOAD_SECRET ?? "test-secret-key",
      admin: {
        user: Users.slug,
      },
      logger:
        process.env.LOG_LEVEL && process.env.LOG_LEVEL !== "silent"
          ? undefined // Use Payload's default logger when debugging
          : {
              options: {
                level: "fatal",
              },
            },
      debug: false,
      collections: [
        Catalogs,
        Datasets,
        DatasetSchemas,
        ImportFiles,
        ImportJobs,
        // ImportDatasets and ImportSchemaBuilders collections were removed
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
          analyzeDuplicatesJob,
          cleanupApprovalLocksJob,
          createEventsBatchJob,
          createSchemaVersionJob,
          datasetDetectionJob,
          geocodeBatchJob,
          schemaDetectionJob,
          validateSchemaJob,
        ],
      },
      db: postgresAdapter({
        pool: {
          connectionString: dbUrl,
        },
        schemaName: "payload",
        push: false,
        prodMigrations: migrations,
      }),
      editor: lexicalEditor({}),
    });

    const payload = await getPayload({ config: testConfig });
    await payload.db.migrate();

    // Verify the schema was created correctly
    await verifyDatabaseSchema(dbUrl);
  } catch (error) {
    // Always show migration errors, regardless of log level
    logger.error(`Migration FAILED for global setup ${testDbName}:`, error);
    throw error;
  }
});

// Global teardown to clean up
afterAll(() => {
  // Clean up temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // Don't drop the database - leave it for debugging if needed
  // The next test run will reuse it
});

// Import centralized mocks
import "../mocks/external/next-navigation";
