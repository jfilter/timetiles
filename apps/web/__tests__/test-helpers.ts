import { randomUUID } from "crypto";
import fs from "fs";
import { dropTestDatabase } from "./database-setup";
import { verifyDatabaseSchema, waitForMigrations } from "./verify-schema";
import { migrations } from "@/migrations";
import Catalogs from "@/lib/collections/Catalogs";
import Datasets from "@/lib/collections/Datasets";
import GeocodingProviders from "@/lib/collections/GeocodingProviders";
import Imports from "@/lib/collections/Imports";
import LocationCache from "@/lib/collections/LocationCache";
import { MainMenu } from "@/lib/collections/MainMenu";
import Media from "@/lib/collections/Media";
import { Pages } from "@/lib/collections/Pages";
import {
  fileParsingJob,
  batchProcessingJob,
  eventCreationJob,
  geocodingBatchJob,
} from "@/lib/jobs/import-jobs";

import Events from "@/lib/collections/Events";
import Users from "@/lib/collections/Users";

/**
 * Creates an isolated test environment for each test
 */
export async function createIsolatedTestEnvironment(): Promise<{
  seedManager: any;
  payload: any;
  cleanup: () => Promise<void>;
  tempDir: string;
}> {
  const testId = randomUUID();
  const workerId = process.env.VITEST_WORKER_ID || "1";
  
  // In CI, use the pre-created databases to avoid migration issues
  const isCI = process.env.CI === 'true';
  const dbName = isCI 
    ? `timetiles_test_${workerId}` 
    : `timetiles_test_${workerId}_${testId.replace(/-/g, "_")}`;
  const dbUrl = `postgresql://timetiles_user:timetiles_password@localhost:5432/${dbName}`;
  const tempDir = `/tmp/timetiles-test-${workerId}-${testId}`;

  console.log(`[TEST-HELPER] Test environment - CI: ${isCI}, Worker: ${workerId}, DB: ${dbName}`);

  // Create unique temp directory for this test
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Only create database if not in CI (CI pre-creates them)
  if (!isCI) {
    console.log(`[TEST-HELPER] Creating isolated test database: ${dbName}`);
    const { createTestDatabase } = await import("./database-setup");
    await createTestDatabase(dbName);
    console.log(`[TEST-HELPER] Isolated test database created: ${dbName}`);
  } else {
    console.log(`[TEST-HELPER] Using pre-created CI database: ${dbName}`);
  }

  // Initialize Payload with isolated database using environment override
  const originalDbUrl = process.env.DATABASE_URL;
  const originalSecret = process.env.PAYLOAD_SECRET;

  // Override environment variables for this test instance
  process.env.DATABASE_URL = dbUrl;
  process.env.PAYLOAD_SECRET = process.env.PAYLOAD_SECRET || "test-secret-key";
  (process.env as any).NODE_ENV = "test"; // Prevent interactive prompts

  const { getPayload, buildConfig } = await import("payload");
  const { postgresAdapter } = await import("@payloadcms/db-postgres");
  const { lexicalEditor } = await import("@payloadcms/richtext-lexical");

  // Create test config
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

  console.log(`[TEST-HELPER] Initializing Payload for isolated test...`);
  const payload = await getPayload({ config: testConfig });
  console.log(`[TEST-HELPER] Payload initialized for test with DB: ${dbName}`);

  // Force migrations to run (only if not in CI, as CI already has migrations)
  if (!isCI) {
    try {
      console.log(`[TEST-HELPER] Running migrations for isolated test database...`);
      const migrationResult = await payload.db.migrate();
      console.log(`[TEST-HELPER] Migration result:`, migrationResult);
      console.log(`[TEST-HELPER] Successfully ran migrations for test database: ${dbName}`);
      
      // In test environments, Payload might handle migrations differently
      // Let's just verify the schema directly without waiting for migration records
      console.log(`[TEST-HELPER] Verifying database schema...`);
      await verifyDatabaseSchema(dbUrl);
      console.log(`[TEST-HELPER] Database schema verified successfully`);
    } catch (error) {
      console.error(`Migration FAILED for ${dbName}:`, error);
      // Re-throw the error to fail the test
      throw error;
    }
  } else {
    // In CI, just verify the schema exists from global setup
    console.log(`[TEST-HELPER] Verifying pre-migrated CI database schema...`);
    await verifyDatabaseSchema(dbUrl);
    console.log(`[TEST-HELPER] CI database schema verified successfully`);
  }

  // Restore original environment variables
  if (originalDbUrl) {
    process.env.DATABASE_URL = originalDbUrl;
  } else {
    delete process.env.DATABASE_URL;
  }
  if (originalSecret) {
    process.env.PAYLOAD_SECRET = originalSecret;
  } else {
    delete process.env.PAYLOAD_SECRET;
  }

  // Set global test payload for route handlers to use
  (global as any).__TEST_PAYLOAD__ = payload;

  // Import the real SeedManager class
  const { SeedManager } = await import("../lib/seed/index");
  const seedManager = new SeedManager();

  // Override the initialize method to use the isolated payload instance
  const originalInitialize = seedManager.initialize.bind(seedManager);
  seedManager.initialize = async () => {
    // Set the payload instance directly instead of creating a new one
    (seedManager as any).payload = payload;
    return payload;
  };

  const cleanup = async () => {
    try {
      if ((global as any).__TEST_PAYLOAD__) {
        (global as any).__TEST_PAYLOAD__ = undefined;
      }
    } catch (error) {
      console.warn("Failed to clean up global test payload:", error);
    }

    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn("Failed to clean up temp directory:", error);
    }

    try {
      // await dropTestDatabase(dbName);
    } catch (error) {
      console.warn("Failed to drop test database:", error);
    }
  };

  return { seedManager, payload, cleanup, tempDir };
}

/**
 * Helper to create unique identifiers for tests
 */
export function createTestId(): string {
  return `test-${Date.now()}-${randomUUID().split("-")[0]}`;
}

/**
 * Helper to create unique file paths
 */
export function createTempFilePath(tempDir: string, filename: string): string {
  const testId = createTestId();
  return `${tempDir}/${testId}-${filename}`;
}
