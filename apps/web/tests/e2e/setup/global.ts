import type { FullConfig } from "@playwright/test";

import { SeedManager } from "../../../lib/seed";
import { setupTestDatabase } from "../../../scripts/setup-test-db";

const globalSetup = async (config: FullConfig) => {
  console.log("🚀 Setting up E2E test environment...");

  // Check if we're running a subset of tests (single test or specific file)
  const isFullSuite = !process.argv.some(
    (arg) =>
      arg.includes(".test.ts:") || // Single test line
      arg.includes("--grep") || // Test filtering
      (arg.includes(".test.ts") && !arg.includes("flows/")), // Single file but not full flows
  );

  if (!isFullSuite) {
    console.log("🔍 Single test run detected - skipping expensive database setup");
    console.log("💡 Assuming test database is already set up from previous full run");
    console.log("🎯 E2E test environment ready (fast mode)");
    return;
  }

  try {
    // Step 1: Ensure database exists with PostGIS and migrations (gentle setup)
    console.log("🗄️ Setting up test database...");
    await setupTestDatabase();

    // Step 2: Truncate tables and seed with fresh test data
    console.log("🌱 Truncating tables and seeding fresh data...");
    const seedManager = new SeedManager();

    try {
      // For E2E tests, we want clean, predictable state via table truncation
      await seedManager.seed({
        environment: "test",
        truncate: true, // Truncate all tables for clean state
        collections: ["users", "catalogs", "datasets", "events", "imports"],
      });

      console.log("✅ Test database seeded successfully");
    } finally {
      await seedManager.cleanup();
    }

    console.log("🎯 E2E test environment ready");
  } catch (error) {
    console.error("❌ Failed to set up E2E test environment:", error);
    throw error; // Fail fast if setup fails
  }
};

export default globalSetup;
