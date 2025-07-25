import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { getPayload, buildConfig } from "payload";

import { truncateAllTables } from "./database-setup";
import { verifyDatabaseSchema } from "./verify-schema";

// Import collections
import Catalogs from "@/lib/collections/catalogs";
import Datasets from "@/lib/collections/datasets";
import Events from "@/lib/collections/events";
import GeocodingProviders from "@/lib/collections/geocoding-providers";
import Imports from "@/lib/collections/imports";
import LocationCache from "@/lib/collections/location-cache";
import { MainMenu } from "@/lib/collections/main-menu";
import Media from "@/lib/collections/media";
import { Pages } from "@/lib/collections/pages";
import Users from "@/lib/collections/users";
import { fileParsingJob, batchProcessingJob, eventCreationJob, geocodingBatchJob } from "@/lib/jobs/import-jobs";
import { logger } from "@/lib/logger";
import { migrations } from "@/migrations";

/**
 * Creates an isolated test environment for each test
 * Uses the database already set up by the global setup, just truncates tables
 */
export const createIsolatedTestEnvironment = async (): Promise<{
  seedManager: any;
  payload: any;
  cleanup: () => Promise<void>;
  tempDir: string;
}> => {
  const testId = randomUUID();
  const workerId = process.env.VITEST_WORKER_ID || "1";
  const tempDir = `/tmp/timetiles-test-${workerId}-${testId}`;

  // Create unique temp directory for this test
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Use the database that was already set up by the global setup
  const dbName = `timetiles_test_${workerId}`;
  const dbUrl = process.env.DATABASE_URL || `postgresql://timetiles_user:timetiles_password@localhost:5432/${dbName}`;

  // Truncate all tables to ensure clean state for this test
  await truncateAllTables(dbUrl);

  // Create test config (similar to setup.ts but using the existing database)
  const testConfig = buildConfig({
    secret: process.env.PAYLOAD_SECRET || "test-secret-key",
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

  // Payload instances are now created as needed via getPayload({ config })

  // Import the real SeedManager class
  const { SeedManager } = await import("../../lib/seed/index");
  const seedManager = new SeedManager();

  // Override the initialize method to use the isolated payload instance
  seedManager.initialize = async () => {
    // Set the payload instance directly instead of creating a new one
    (seedManager as any).payload = payload;

    // Initialize relationship resolver with the test payload instance
    const { RelationshipResolver } = await import("../../lib/seed/relationship-resolver");
    (seedManager as any).relationshipResolver = new RelationshipResolver(payload);

    // Initialize database operations with the test payload instance
    const { DatabaseOperations } = await import("../../lib/seed/database-operations");
    (seedManager as any).databaseOperations = new DatabaseOperations(payload);

    return payload;
  };

  const cleanup = async () => {
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      logger.warn("Failed to clean up temp directory:", error);
    }

    // Truncate tables for the next test
    try {
      await truncateAllTables(dbUrl);
    } catch (error) {
      logger.warn("Failed to truncate tables during cleanup:", error);
    }
  };

  return { seedManager, payload, cleanup, tempDir };
};

/**
 * Helper to create unique identifiers for tests
 */
export const createTestId = (): string => `test-${Date.now()}-${randomUUID().split("-")[0]}`;

/**
 * Helper to create unique file paths
 */
export const createTempFilePath = (tempDir: string, filename: string): string => {
  const testId = createTestId();
  return `${tempDir}/${testId}-${filename}`;
};
