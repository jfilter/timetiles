import { randomUUID } from "crypto";
import fs from "fs";
import { dropTestDatabase } from "./database-setup";
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
  const dbName = `timetiles_test_${workerId}_${testId.replace(/-/g, "_")}`;
  const dbUrl = `postgresql://timetiles_user:timetiles_password@localhost:5432/${dbName}`;
  const tempDir = `/tmp/timetiles-test-${workerId}-${testId}`;

  // Create unique temp directory for this test
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create unique database
  const { createTestDatabase } = await import("./database-setup");
  await createTestDatabase(dbName);

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
      push: true, // Disable push mode for tests, use migrations only
      prodMigrations: migrations,
    }),
    editor: lexicalEditor({}),
  });

  const payload = await getPayload({ config: testConfig });
  // console.log(`Initialized Payload for test with DB: ${dbName}`);

  // prodMigrations will handle migrations automatically at initialization

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
