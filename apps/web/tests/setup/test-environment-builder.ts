/**
 * TestEnvironmentBuilder
 *
 * Provides a simplified and flexible way to create test environments with
 * different isolation levels and seeding options. This replaces the basic
 * test-helpers with a more robust and configurable system.
 */

import { postgresAdapter } from "@payloadcms/db-postgres";
import { lexicalEditor } from "@payloadcms/richtext-lexical";
import { randomUUID } from "crypto";
import fs from "fs";
import { getPayload, buildConfig } from "payload";

import { truncateAllTables } from "./database-setup";

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
import { createLogger } from "@/lib/logger";
import { SeedManager } from "@/lib/seed/index";
import { RelationshipResolver } from "@/lib/seed/relationship-resolver";
import { migrations } from "@/migrations";

const logger = createLogger("test-env");

export interface TestEnvironmentOptions {
  /** Collections to include in the test environment */
  collections?: string[];
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
  private static activeEnvironments = new Set<TestEnvironment>();

  /**
   * Create a new test environment with the specified options
   */
  async createTestEnvironment(options: TestEnvironmentOptions = {}): Promise<TestEnvironment> {
    const {
      collections = ["events", "catalogs", "datasets", "users"],
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

    // Generate unique identifiers
    const testId = randomUUID();
    const workerId = process.env.VITEST_WORKER_ID || "1";
    const dbName = this.generateTestDbName(isolationLevel, workerId, testId);

    // Create temporary directory if requested
    let tempDir: string | undefined;
    if (createTempDir) {
      tempDir = `/tmp/timetiles-test-${workerId}-${testId}`;
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
    }

    // Use shared test database instead of creating unique ones to avoid connection issues
    const dbUrl =
      process.env.DATABASE_URL || `postgresql://timetiles_user:timetiles_password@localhost:5432/timetiles_test`;

    logger.debug("Initializing test database", {
      dbName: "shared",
      collections: collections.length,
    });

    // Clean database state
    await truncateAllTables(dbUrl);

    // Create optimized Payload config for testing
    const testConfig = this.buildTestConfig(dbUrl, collections);
    const payload = await getPayload({ config: testConfig });

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
      dbName,
      tempDir,
      cleanup: () => this.cleanup(testEnv),
      getCollectionCount: (collection: string) => seedManager.getCollectionCount(collection),
      truncateCollections: (colls: string[]) => seedManager.truncate(colls),
    };

    // Track active environment for cleanup
    TestEnvironmentBuilder.activeEnvironments.add(testEnv);

    logger.info("Test environment created successfully", {
      dbName,
      tempDir: tempDir ? "created" : "none",
      seeded: seedData || Object.keys(customSeedData).length > 0,
    });

    return testEnv;
  }

  /**
   * Create a lightweight test environment for unit tests
   */
  async createUnitTestEnvironment(): Promise<TestEnvironment> {
    return this.createTestEnvironment({
      collections: ["users"], // Minimal collections
      seedData: false,
      isolationLevel: "test",
      createTempDir: false,
    });
  }

  /**
   * Create a full integration test environment
   */
  async createIntegrationTestEnvironment(customData?: Record<string, any[]>): Promise<TestEnvironment> {
    return this.createTestEnvironment({
      collections: ["users", "catalogs", "datasets", "events", "imports"],
      seedData: false, // Don't seed automatically to avoid relationship issues
      isolationLevel: "suite",
      customSeedData: customData || {},
      environment: "test",
    });
  }

  /**
   * Create an isolated test environment for parallel testing
   */
  async createIsolatedTestEnvironment(): Promise<TestEnvironment> {
    return this.createTestEnvironment({
      collections: ["users", "catalogs", "datasets", "events"],
      seedData: false,
      isolationLevel: "worker",
      createTempDir: true,
    });
  }

  /**
   * Clean up all active test environments
   */
  static async cleanupAll(): Promise<void> {
    logger.info(`Cleaning up ${TestEnvironmentBuilder.activeEnvironments.size} active test environments`);

    const cleanupPromises = Array.from(TestEnvironmentBuilder.activeEnvironments).map((env) =>
      env.cleanup().catch((error) =>
        logger.warn("Failed to cleanup test environment", {
          error: error.message,
        }),
      ),
    );

    await Promise.all(cleanupPromises);
    TestEnvironmentBuilder.activeEnvironments.clear();

    logger.info("All test environments cleaned up");
  }

  /**
   * Generate a unique test database name based on isolation level
   */
  private generateTestDbName(isolationLevel: string, workerId: string, testId: string): string {
    // Use UUID prefix for true uniqueness instead of timestamp to prevent collisions
    const uniqueId = testId.substring(0, 8);
    return `timetiles_test_${isolationLevel}_${workerId}_${uniqueId}`;
  }

  /**
   * Build optimized Payload config for testing
   */
  private buildTestConfig(dbUrl: string, collections: string[]) {
    // Map collection names to collection objects
    const collectionMap: Record<string, any> = {
      catalogs: Catalogs,
      datasets: Datasets,
      imports: Imports,
      events: Events,
      users: Users,
      media: Media,
      "location-cache": LocationCache,
      "geocoding-providers": GeocodingProviders,
      pages: Pages,
    };

    const selectedCollections = collections.map((name) => collectionMap[name]).filter(Boolean);

    return buildConfig({
      secret: process.env.PAYLOAD_SECRET || "test-secret-key",
      admin: {
        user: collections.includes("users") ? Users.slug : undefined,
        disable: true, // Disable admin for better test performance
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
      collections: selectedCollections,
      globals: [MainMenu],
      jobs: {
        tasks: [fileParsingJob, batchProcessingJob, eventCreationJob, geocodingBatchJob],
      },
      db: postgresAdapter({
        pool: {
          connectionString: dbUrl,
          max: 5, // Smaller pool for tests
        },
        schemaName: "payload",
        push: false,
        prodMigrations: migrations,
      }),
      editor: lexicalEditor({}),
    });
  }

  /**
   * Configure SeedManager for the test environment
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
   * Seed test data using efficient methods
   */
  private async seedTestData(
    seedManager: SeedManager,
    customData: Record<string, any[]>,
    environment: string,
    collections: string[],
  ): Promise<void> {
    if (Object.keys(customData).length > 0) {
      // Use custom seed data
      logger.debug("Seeding custom test data", {
        collections: Object.keys(customData),
      });

      for (const [collection, data] of Object.entries(customData)) {
        if (data.length > 0) {
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
      }
    } else {
      // Use standard seeding
      await seedManager.seed({
        collections,
        environment: environment as "production" | "development" | "test" | "staging",
        truncate: false, // Already truncated
      });
    }
  }

  /**
   * Cleanup test environment
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

      // Truncate tables for next test
      await truncateAllTables(
        process.env.DATABASE_URL || `postgresql://timetiles_user:timetiles_password@localhost:5432/timetiles_test`,
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
 * Convenience function for creating test environments
 */
export const createTestEnvironment = async (options?: TestEnvironmentOptions): Promise<TestEnvironment> => {
  const builder = new TestEnvironmentBuilder();
  return builder.createTestEnvironment(options);
};

/**
 * Convenience function for creating unit test environments
 */
export const createUnitTestEnvironment = async (): Promise<TestEnvironment> => {
  const builder = new TestEnvironmentBuilder();
  return builder.createUnitTestEnvironment();
};

/**
 * Convenience function for creating integration test environments
 */
export const createIntegrationTestEnvironment = async (
  customData?: Record<string, any[]>,
): Promise<TestEnvironment> => {
  const builder = new TestEnvironmentBuilder();
  return builder.createIntegrationTestEnvironment(customData);
};
