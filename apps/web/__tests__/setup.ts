// Vitest setup file
import { beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs";

import { createTestDatabase } from "./database-setup";
import { verifyDatabaseSchema, waitForMigrations } from "./verify-schema";

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}
process.env.PAYLOAD_SECRET = "test-secret-key";

// Create isolated test database for each worker
const workerId = process.env.VITEST_WORKER_ID || "1";
const testDbName = `timetiles_test_${workerId}`;
const dbUrl = `postgresql://timetiles_user:timetiles_password@localhost:5432/${testDbName}`;
process.env.DATABASE_URL = dbUrl;

// Create unique temp directory for each test worker
const tempDir = `/tmp/timetiles-test-${workerId}-${randomUUID()}`;
process.env.TEMP_DIR = tempDir;

// Global setup to ensure clean test environment
beforeAll(async () => {
  console.log(`[SETUP] Setting up test environment for worker ${workerId}`);
  console.log(`[SETUP] Test database: ${testDbName}`);
  console.log(`[SETUP] DATABASE_URL: ${dbUrl}`);
  console.log(`[SETUP] NODE_ENV: ${process.env.NODE_ENV}`);
  console.log(`[SETUP] CI: ${process.env.CI}`);
  
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create test database if it doesn't exist (includes PostGIS setup)
  console.log(`[SETUP] Creating test database: ${testDbName}`);
  await createTestDatabase(testDbName);
  console.log(`[SETUP] Test database created successfully: ${testDbName}`);
  
  // Run migrations to ensure database schema is up to date
  try {
    const { getPayload, buildConfig } = await import("payload");
    const { postgresAdapter } = await import("@payloadcms/db-postgres");
    const { lexicalEditor } = await import("@payloadcms/richtext-lexical");
    const { migrations } = await import("../migrations");
    
    // Import all collections to ensure proper migration
    const Catalogs = (await import("../lib/collections/Catalogs")).default;
    const Datasets = (await import("../lib/collections/Datasets")).default;
    const Imports = (await import("../lib/collections/Imports")).default;
    const Events = (await import("../lib/collections/Events")).default;
    const Users = (await import("../lib/collections/Users")).default;
    const Media = (await import("../lib/collections/Media")).default;
    const LocationCache = (await import("../lib/collections/LocationCache")).default;
    const GeocodingProviders = (await import("../lib/collections/GeocodingProviders")).default;
    const { Pages } = await import("../lib/collections/Pages");
    const { MainMenu } = await import("../lib/collections/MainMenu");
    const {
      fileParsingJob,
      batchProcessingJob,
      eventCreationJob,
      geocodingBatchJob,
    } = await import("../lib/jobs/import-jobs");
    
    const testConfig = buildConfig({
      secret: process.env.PAYLOAD_SECRET || "test-secret-key",
      admin: {
        user: Users.slug,
      },
      collections: [
        Catalogs,
        Datasets,
        Imports,
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
          fileParsingJob,
          batchProcessingJob,
          eventCreationJob,
          geocodingBatchJob,
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
    
    console.log(`[SETUP] Initializing Payload for migrations...`);
    const payload = await getPayload({ config: testConfig });
    
    console.log(`[SETUP] Running migrations...`);
    await payload.db.migrate();
    console.log(`[SETUP] Successfully ran migrations for global test setup: ${testDbName}`);
    
    // Wait for migrations to be recorded and verify schema
    console.log(`[SETUP] Waiting for migrations to complete...`);
    await waitForMigrations(dbUrl, 10000);
    
    console.log(`[SETUP] Verifying database schema...`);
    await verifyDatabaseSchema(dbUrl);
    console.log(`[SETUP] Database schema verified successfully`);
  } catch (error) {
    console.error(`Migration FAILED for global setup ${testDbName}:`, error);
    // Re-throw the error to fail the test setup
    throw error;
  }
  
  console.log(`[SETUP] Test environment setup complete for worker ${workerId}`);
});
