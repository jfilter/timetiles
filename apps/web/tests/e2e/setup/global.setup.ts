// Global setup for E2E tests using Playwright's project dependencies pattern

import { test as setup } from "@playwright/test";

import { logger } from "../../../lib/logger";
import { SeedManager } from "../../../lib/seed";
import { setupTestDatabase } from "../../../scripts/setup-test-db";
import { validateTestDatabaseSchema } from "../../../scripts/validate-test-db-schema";

setup("create test database and seed data", async ({}) => {
  logger.info("🚀 Setting up E2E test environment...");

  // Check if we're running a subset of tests (single test or specific file)
  const isFullSuite = !process.argv.some(
    (arg) =>
      arg.includes(".test.ts:") || // Single test line
      arg.includes("--grep") || // Test filtering
      (arg.includes(".test.ts") && !arg.includes("flows/")), // Single file but not full flows
  );

  if (!isFullSuite) {
    logger.info("🔍 Single test run detected - validating existing database");

    // Even for single tests, validate the database schema
    try {
      const validationResult = await validateTestDatabaseSchema();

      if (!validationResult.isValid) {
        logger.warn("❌ Database schema issues detected in fast mode:");
        validationResult.issues.forEach((issue) => logger.warn(`  • ${issue}`));
        logger.info("🔧 Running full setup due to schema issues");

        // Fall through to full setup
      } else {
        logger.info("✅ Database schema is valid");
        logger.info("🎯 E2E test environment ready (fast mode)");
        return;
      }
    } catch (error) {
      logger.warn("Failed to validate database schema in fast mode:", error);
      logger.info("🔧 Running full setup due to validation failure");
      // Fall through to full setup
    }
  }

  try {
    // Setup project runs BEFORE webServer, so we need to ensure database exists
    logger.info("🗄️ Setting up test database...");

    // Use enhanced setup with auto-recovery
    await setupTestDatabase({ forceReset: false });

    logger.info("🌱 Seeding fresh test data...");
    const seedManager = new SeedManager();

    try {
      // For E2E tests, we want clean, predictable state via table truncation
      await seedManager.seed({
        environment: "test",
        truncate: true, // Truncate all tables for clean state
        collections: ["users", "catalogs", "datasets", "events"],
      });

      logger.info("✅ Test database seeded successfully");
    } finally {
      await seedManager.cleanup();
    }

    logger.info("🎯 E2E test environment ready");
  } catch (error) {
    logger.error("❌ Failed to set up E2E test environment:", { error });
    throw error; // Fail fast if setup fails
  }
});
