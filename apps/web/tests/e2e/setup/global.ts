/**
 * E2E test setup configuration.
 *
 * Configures the test environment and ensures database
 * is properly initialized with test data.
 *
 * @module
 * @category E2E Tests
 */

import { test as setup } from "@playwright/test";

import { logger } from "../../../lib/logger";
import { SeedManager } from "../../../lib/seed";
import { setupTestDatabase } from "../../../scripts/e2e-setup-database";

setup("create test database and seed data", async () => {
  logger.info("🚀 Setting up E2E test environment...");

  // Check if we're running a subset of tests (single test or specific file)
  const isFullSuite = !process.argv.some(
    (arg) =>
      arg.includes(".test.ts:") || // Single test line
      arg.includes("--grep") || // Test filtering
      (arg.includes(".test.ts") && !arg.includes("flows/")) // Single file but not full flows
  );

  if (!isFullSuite) {
    logger.info("🔍 Single test run detected - skipping expensive database setup");
    logger.info("💡 Assuming test database is already set up from previous full run");
    logger.info("🎯 E2E test environment ready (fast mode)");
    return;
  }

  try {
    // Step 1: Ensure database exists with PostGIS and migrations (gentle setup)
    logger.info("🗄️ Setting up test database...");
    await setupTestDatabase();

    // Step 2: Truncate tables and seed with fresh test data
    logger.info("🌱 Truncating tables and seeding fresh data...");
    const seedManager = new SeedManager();

    try {
      // For E2E tests, we want clean, predictable state via table truncation
      await seedManager.seed({
        environment: "test",
        truncate: true, // Truncate all tables for clean state
        collections: ["users", "catalogs", "datasets", "events", "imports"],
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
