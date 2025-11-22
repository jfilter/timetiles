#!/usr/bin/env tsx

/**
 * Test Database Setup Script.
 *
 * This script ensures a clean, consistent test database is available for E2E tests.
 * It handles:
 * - Database creation
 * - PostGIS extension setup
 * - Schema migrations
 * - Basic validation.
 *
 * Uses shared database utilities for consistency with unit/integration test setup.
 *
 * @module
 * @category Scripts
 */

import { setupDatabase } from "../lib/database/setup";
import { deriveE2eDatabaseUrl, getDatabaseUrl, parseDatabaseUrl } from "../lib/database/url";
import { createLogger } from "../lib/logger";
import { resetTestDatabase, validateTestDatabaseSchema } from "./e2e-validate-schema";

const logger = createLogger("test-db-setup");

// Get DATABASE_URL from environment - required
const DATABASE_URL = getDatabaseUrl(true)!;

// Derive E2E test database URL
const TEST_DATABASE_URL = deriveE2eDatabaseUrl(DATABASE_URL);
const { database: TEST_DB_NAME } = parseDatabaseUrl(TEST_DATABASE_URL);

const setupTestDatabase = async (options: { forceReset?: boolean } = {}): Promise<void> => {
  logger.info("🗄️  Setting up test database for E2E tests");

  try {
    // Step 0: Validate existing schema if database exists
    logger.info("Step 0: Validating existing database schema");

    const validationResult = await validateTestDatabaseSchema();

    if (!validationResult.isValid && validationResult.migrationState.hasPayloadSchema) {
      logger.warn("❌ Detected inconsistent database schema:");
      validationResult.issues.forEach((issue) => logger.warn(`  • ${issue}`));

      if (options.forceReset) {
        logger.info("🔄 Force reset enabled - dropping and recreating database");
        await resetTestDatabase(true);
      } else {
        logger.info("💡 Consider using --force-reset to automatically fix schema issues");
        logger.info("🔧 Auto-recovering by dropping and recreating database");
        await resetTestDatabase(true);
      }
    } else if (!validationResult.isValid && !validationResult.migrationState.hasPayloadSchema) {
      logger.info("📝 Database doesn't exist or has no schema - will create fresh");
    } else {
      logger.info("✅ Existing database schema is valid");
    }

    // Step 1-3: Setup database with shared utility
    logger.info("Step 1: Setting up database (create, PostGIS, schema, migrations)");

    try {
      await setupDatabase({
        databaseName: TEST_DB_NAME,
        connectionString: TEST_DATABASE_URL,
        enablePostGIS: true,
        createPayloadSchema: true,
        runMigrations: true,
        skipIfExists: true,
        verbose: true,
      });
    } catch (setupError) {
      // Log to both logger and console to ensure visibility
      const errorMsg = "❌ Database setup failed - this usually indicates schema conflicts";
      logger.error(errorMsg, setupError);

      logger.info("🔧 Attempting automatic recovery by resetting database");

      try {
        await resetTestDatabase(true);

        // Retry setup after reset
        await setupDatabase({
          databaseName: TEST_DB_NAME,
          connectionString: TEST_DATABASE_URL,
          enablePostGIS: true,
          createPayloadSchema: true,
          runMigrations: true,
          dropIfExists: false, // Already dropped by resetTestDatabase
          skipIfExists: false, // Force recreation
          verbose: true,
        });

        logger.info("✅ Database reset and setup completed successfully");
      } catch (recoveryError) {
        const recoveryMsg = "❌ Failed to recover from setup error:";
        logger.error(recoveryMsg, recoveryError);

        throw recoveryError;
      }
    }

    // Step 4: Final validation
    logger.info("Step 4: Final database validation");
    const finalValidation = await validateTestDatabaseSchema();

    if (!finalValidation.isValid) {
      const errorMsg = "❌ Database setup completed but validation failed:";
      logger.error(errorMsg);

      finalValidation.issues.forEach((issue) => {
        logger.error(`  • ${issue}`);
      });
      throw new Error("Database setup validation failed");
    }

    logger.info("✅ Test database setup completed successfully");
    logger.info(`🔗 Test database URL: ${TEST_DATABASE_URL}`);
    logger.info(`📊 Schema contains ${finalValidation.migrationState.completedMigrations.length} completed migrations`);

    // Step 5: Seed test data for E2E tests
    logger.info("Step 5: Seeding test data");
    try {
      await seedE2ETestData();
      logger.info("✅ Test data seeded successfully");
    } catch (seedError) {
      logger.error("Failed to seed test data", seedError);
      throw seedError;
    }
  } catch (error) {
    const errorMsg = "❌ Test database setup failed:";
    logger.error(errorMsg, error);
    process.exit(1);
  }
};

/**
 * Seed E2E test data using the seed manager.
 * Uses "development" environment to match CI and default `pnpm seed` behavior.
 */
const seedE2ETestData = async (): Promise<void> => {
  // Set DATABASE_URL to E2E test database so seed manager connects to the right database
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = TEST_DATABASE_URL;

  try {
    const { createSeedManager } = await import("../lib/seed/index");

    const seedManager = createSeedManager();

    // Truncate first to ensure clean state
    await seedManager.truncate();

    // Seed e2e environment data (same as CI: pnpm seed e2e)
    // This creates the catalogs, datasets, and events that E2E tests expect
    await seedManager.seedWithConfig({
      preset: "e2e",
      collections: ["users", "catalogs", "datasets", "events", "pages"],
    });

    logger.info("✓ Seeded e2e data using seed manager");
  } finally {
    // Restore original DATABASE_URL
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
  }
};

// Allow running as standalone script
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const forceReset = args.includes("--force-reset") || args.includes("--force");

  void setupTestDatabase({ forceReset });
}

export { setupTestDatabase, TEST_DATABASE_URL };
