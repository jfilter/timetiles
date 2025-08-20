/**
 * Global setup for E2E tests.
 *
 * Uses Playwright's project dependencies pattern to ensure
 * database is prepared before running tests.
 *
 * @module
 * @category E2E Tests
 */

import { test as setup } from "@playwright/test";

// Import scripts directly as they are standalone
import { setupTestDatabase } from "../../../scripts/setup-test-db";
import { validateTestDatabaseSchema } from "../../../scripts/validate-test-db-schema";

setup("create test database and seed data", async () => {
  console.log("🚀 Setting up E2E test environment...");

  // Check if we're running a subset of tests (single test or specific file)
  const isFullSuite = !process.argv.some(
    (arg) =>
      arg.includes(".test.ts:") || // Single test line
      arg.includes("--grep") || // Test filtering
      (arg.includes(".test.ts") && !arg.includes("flows/")) // Single file but not full flows
  );

  if (!isFullSuite) {
    console.log("🔍 Single test run detected - validating existing database");

    // Even for single tests, validate the database schema
    try {
      const validationResult = await validateTestDatabaseSchema();

      if (!validationResult.isValid) {
        console.warn("❌ Database schema issues detected in fast mode:");
        validationResult.issues.forEach((issue) => console.warn(`  • ${issue}`));
        console.log("🔧 Running full setup due to schema issues");

        // Fall through to full setup
      } else {
        console.log("✅ Database schema is valid");
        console.log("🎯 E2E test environment ready (fast mode)");
        return;
      }
    } catch (error) {
      console.warn("Failed to validate database schema in fast mode:", error);
      console.log("🔧 Running full setup due to validation failure");
      // Fall through to full setup
    }
  }

  try {
    // Setup project runs BEFORE webServer, so we need to ensure database exists
    console.log("🗄️ Setting up test database...");

    // Use enhanced setup with auto-recovery
    await setupTestDatabase({ forceReset: false });

    console.log("🌱 Seeding test data using seed script...");

    // Use the seed script directly to avoid module resolution issues
    const { execSync } = await import("child_process");
    try {
      execSync("pnpm seed test", {
        stdio: "inherit",
        env: {
          ...process.env,
          DATABASE_URL: "postgresql://timetiles_user:timetiles_password@localhost:5432/timetiles_test",
        },
      });
      console.log("✅ Test database seeded successfully");
    } catch (seedError) {
      console.error("Failed to seed database:", seedError);
      throw seedError;
    }

    console.log("🎯 E2E test environment ready");
  } catch (error) {
    console.error("❌ Failed to set up E2E test environment:", error);
    throw error; // Fail fast if setup fails
  }
});
