/**
 * TestEnvironmentBuilder.
 *
 * Provides a simplified and flexible way to create test environments with
 * different isolation levels and seeding options. This replaces the basic
 * test-helpers with a more robust and configurable system.
 *
 * @module
 * @category Test Setup
 */

import { randomUUID } from "crypto";
import fs from "fs";
import { getPayload } from "payload";

import type { CollectionName } from "@/lib/config/payload-config-factory";
import { createTestConfig } from "@/lib/config/payload-config-factory";
import { createLogger } from "@/lib/logger";
import { SeedManager } from "@/lib/seed/index";
import { RelationshipResolver } from "@/lib/seed/relationship-resolver";

import { createTestDatabase, truncateAllTables } from "./database-setup";

const logger = createLogger("test-env");

export interface TestEnvironmentOptions {
  /** Collections to include in the test environment */
  collections?: CollectionName[];
  /** Whether to seed data automatically */
  seedData?: boolean;
  /** Isolation level for the test environment */
  isolationLevel?: "worker" | "suite" | "test";
  /** Custom seed data to use instead of defaults */
  customSeedData?: Record<string, any[]>;
  /** Environment type for seeding */
  environment?: "test" | "development";
  /** Whether to create a temporary directory */
  createTempDir?: boolean;
}

export interface TestEnvironment {
  /** Payload instance for this test environment */
  payload: any;
  /** SeedManager instance configured for this environment */
  seedManager: SeedManager;
  /** Database connection info */
  connection: any;
  /** Database name */
  dbName: string;
  /** Temporary directory path (if created) */
  tempDir?: string;
  /** Cleanup function to call when done */
  cleanup: () => Promise<void>;
  /** Get collection count helper */
  getCollectionCount: (collection: string) => Promise<number>;
  /** Truncate specific collections helper */
  truncateCollections: (collections: string[]) => Promise<void>;
}

export class TestEnvironmentBuilder {
  private static readonly activeEnvironments = new Set<TestEnvironment>();

  /**
   * Create a new test environment with the specified options.
   */
  async createTestEnvironment(options: TestEnvironmentOptions = {}): Promise<TestEnvironment> {
    const {
      collections = ["events", "catalogs", "datasets", "users"] as CollectionName[],
      seedData = false,
      isolationLevel = "worker",
      customSeedData = {},
      environment = "test" as const,
      createTempDir = true,
    } = options;

    logger.info("Creating test environment", {
      isolationLevel,
      collections,
      seedData,
    });

    // Generate unique identifiers for temp directories only
    const testId = randomUUID();
    const workerId = process.env.VITEST_WORKER_ID ?? "1";

    // Create temporary directory if requested
    let tempDir: string | undefined;
    if (createTempDir) {
      tempDir = `/tmp/timetiles-test-${workerId}-${testId}`;
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
    }

    // Use the same database URL that was set up in the global setup
    const dbName = `timetiles_test_${workerId}`;
    const dbUrl = process.env.DATABASE_URL ?? `postgresql://timetiles_user:timetiles_password@localhost:5432/${dbName}`;

    logger.debug("Initializing test database", {
      workerId,
      dbName,
      collections: collections.length,
    });

    // Ensure database exists
    logger.info("Creating test database", { dbName });
    await createTestDatabase(dbName);
    logger.info("Database created", { dbName });

    // Clean database state with truncation
    logger.info("Truncating tables", { dbName });
    await truncateAllTables(dbUrl);
    logger.info("Tables truncated", { dbName });

    // Create optimized Payload config for testing
    logger.info("Creating test config", { dbName });
    const testConfig = await createTestConfig({
      databaseUrl: dbUrl,
      collections,
      logLevel: (process.env.LOG_LEVEL as any) || "silent",
    });
    logger.info("Test config created", { dbName });

    logger.info("Getting Payload instance", { dbName });
    const payload = await getPayload({ config: testConfig });
    logger.info("Payload instance created", { dbName });

    // Payload instances are now created as needed via getPayload({ config })

    // Create and configure SeedManager
    const seedManager = new SeedManager();
    await this.configureSeedManager(seedManager, payload);

    // Seed data if requested
    if (seedData || Object.keys(customSeedData).length > 0) {
      await this.seedTestData(seedManager, customSeedData, environment, collections);
    }

    // Create test environment
    const testEnv: TestEnvironment = {
      payload,
      seedManager,
      connection: payload.db,
      dbName, // Use the dbName variable from above
      tempDir,
      cleanup: () => this.cleanup(testEnv),
      getCollectionCount: (collection: string) => seedManager.getCollectionCount(collection),
      truncateCollections: (colls: string[]) => seedManager.truncate(colls),
    };

    // Track active environment for cleanup
    TestEnvironmentBuilder.activeEnvironments.add(testEnv);

    logger.info("Test environment created successfully", {
      workerId,
      tempDir: tempDir ? "created" : "none",
      seeded: seedData || Object.keys(customSeedData).length > 0,
    });

    return testEnv;
  }

  /**
   * Create a lightweight test environment for unit tests.
   */
  async createUnitTestEnvironment(): Promise<TestEnvironment> {
    return this.createTestEnvironment({
      collections: ["users"] as CollectionName[], // Minimal collections
      seedData: false,
      isolationLevel: "test",
      createTempDir: false,
    });
  }

  /**
   * Create a full integration test environment.
   */
  async createIntegrationTestEnvironment(customData?: Record<string, any[]>): Promise<TestEnvironment> {
    return this.createTestEnvironment({
      collections: [
        "users",
        "media",
        "pages",
        "catalogs",
        "datasets",
        "dataset-schemas",
        "events",
        "import-files",
        "import-jobs",
        "scheduled-imports",
        "geocoding-providers",
        "location-cache",
      ] as CollectionName[],
      seedData: false, // Don't seed automatically to avoid relationship issues
      isolationLevel: "suite",
      customSeedData: customData ?? {},
      environment: "test",
      createTempDir: true, // Enable temp directory for file operations
    });
  }

  /**
   * Clean up all active test environments.
   */
  static async cleanupAll(): Promise<void> {
    logger.info(`Cleaning up ${TestEnvironmentBuilder.activeEnvironments.size} active test environments`);

    const cleanupPromises = Array.from(TestEnvironmentBuilder.activeEnvironments).map(async (env) => {
      try {
        await env.cleanup();
      } catch (error) {
        logger.warn("Failed to cleanup test environment", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.all(cleanupPromises);
    TestEnvironmentBuilder.activeEnvironments.clear();

    logger.info("All test environments cleaned up");
  }

  /**
   * Configure SeedManager for the test environment.
   */
  private async configureSeedManager(seedManager: SeedManager, payload: any): Promise<void> {
    // Override initialize to use our test payload
    seedManager.initialize = async () => {
      (seedManager as any).payload = payload;
      (seedManager as any).relationshipResolver = new RelationshipResolver(payload);

      // Initialize database operations
      const { DatabaseOperations } = await import("../../lib/seed/database-operations");
      (seedManager as any).databaseOperations = new DatabaseOperations(payload);

      return payload;
    };

    await seedManager.initialize();
  }

  /**
   * Seed test data using efficient methods.
   */
  private async seedTestData(
    seedManager: SeedManager,
    customData: Record<string, any[]>,
    environment: string,
    collections: string[]
  ): Promise<void> {
    if (Object.keys(customData).length === 0) {
      // Use standard seeding
      await seedManager.seed({
        collections,
        environment: environment as "production" | "development" | "test" | "staging",
        truncate: false, // Already truncated
      });
      return;
    }

    // Use custom seed data
    logger.debug("Seeding custom test data", {
      collections: Object.keys(customData),
    });

    for (const [collection, data] of Object.entries(customData)) {
      if (data.length === 0) continue;

      await this.seedCollectionData(seedManager, collection, data);
    }
  }

  private async seedCollectionData(seedManager: SeedManager, collection: string, data: any[]): Promise<void> {
    // Use the RelationshipResolver to handle relationships
    const resolver = (seedManager as any).relationshipResolver as RelationshipResolver;
    const resolvedData = await resolver.resolveCollectionRelationships(data, collection);

    // Create items efficiently
    for (const item of resolvedData) {
      try {
        await (seedManager as any).payload.create({
          collection,
          data: item,
        });
      } catch (error) {
        logger.warn(`Failed to create ${collection} item`, {
          error: (error as any).message,
        });
      }
    }
  }

  /**
   * Cleanup test environment.
   */
  private async cleanup(testEnv: TestEnvironment): Promise<void> {
    logger.debug("Cleaning up test environment", { dbName: testEnv.dbName });

    try {
      // Remove from active environments
      TestEnvironmentBuilder.activeEnvironments.delete(testEnv);

      // Payload cleanup handled automatically by getPayload({ config })

      // Clean up temporary directory
      if (testEnv.tempDir && fs.existsSync(testEnv.tempDir)) {
        fs.rmSync(testEnv.tempDir, { recursive: true, force: true });
      }

      // Clean up seed manager
      await testEnv.seedManager.cleanup();

      // Truncate tables for next test - use the same database URL
      const workerId = process.env.VITEST_WORKER_ID ?? "1";
      await truncateAllTables(
        process.env.DATABASE_URL ??
          `postgresql://timetiles_user:timetiles_password@localhost:5432/timetiles_test_${workerId}`
      );

      logger.debug("Test environment cleanup completed", {
        dbName: testEnv.dbName,
      });
    } catch (error) {
      logger.warn("Error during test environment cleanup", {
        error: (error as any).message,
        dbName: testEnv.dbName,
      });
    }
  }
}

/**
 * Convenience function for creating test environments.
 */
export const createTestEnvironment = async (options?: TestEnvironmentOptions): Promise<TestEnvironment> => {
  const builder = new TestEnvironmentBuilder();
  return builder.createTestEnvironment(options);
};

/**
 * Convenience function for creating unit test environments.
 */
export const createUnitTestEnvironment = async (): Promise<TestEnvironment> => {
  const builder = new TestEnvironmentBuilder();
  return builder.createUnitTestEnvironment();
};

/**
 * Convenience function for creating integration test environments.
 */
export const createIntegrationTestEnvironment = async (
  customData?: Record<string, any[]>
): Promise<TestEnvironment> => {
  // Database setup is handled by the global setup in setup.ts
  // No need to check here as it causes a race condition
  const builder = new TestEnvironmentBuilder();
  return builder.createIntegrationTestEnvironment(customData);
};
