// Vitest setup file
import { randomUUID } from "crypto";
import fs from "fs";

import { logger } from "@/lib/logger";

import { createTestDatabase } from "./database-setup";
import { verifyDatabaseSchema } from "./verify-schema";

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}
process.env.PAYLOAD_SECRET = "test-secret-key";

// Payload logging is now properly controlled via logger and loggingLevels configuration

// Create isolated test database for each worker
const workerId = process.env.VITEST_WORKER_ID ?? "1";
const testDbName = `timetiles_test_${workerId}`;
const dbUrl = `postgresql://timetiles_user:timetiles_password@localhost:5432/${testDbName}`;
process.env.DATABASE_URL = dbUrl;

// Create unique temp directory for each test worker
const tempDir = `/tmp/timetiles-test-${workerId}-${randomUUID()}`;
process.env.TEMP_DIR = tempDir;

// Global setup to ensure clean test environment
beforeAll(async () => {
  if (process.env.LOG_LEVEL && process.env.LOG_LEVEL !== "silent") {
    logger.info(`Setting up test environment for worker ${workerId}`);
  }

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

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
    const Imports = (await import("../../lib/collections/imports")).default;
    const Events = (await import("../../lib/collections/events")).default;
    const Users = (await import("../../lib/collections/users")).default;
    const Media = (await import("../../lib/collections/media")).default;
    const LocationCache = (await import("../../lib/collections/location-cache")).default;
    const GeocodingProviders = (await import("../../lib/collections/geocoding-providers")).default;
    const { Pages } = await import("../../lib/collections/pages");
    const { MainMenu } = await import("../../lib/collections/main-menu");
    const { fileParsingJob, batchProcessingJob, eventCreationJob, geocodingBatchJob } = await import(
      "../../lib/jobs/import-jobs"
    );

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
      collections: [Catalogs, Datasets, Imports, Events, Users, Media, LocationCache, GeocodingProviders, Pages],
      globals: [MainMenu],
      jobs: {
        tasks: [fileParsingJob, batchProcessingJob, eventCreationJob, geocodingBatchJob],
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
