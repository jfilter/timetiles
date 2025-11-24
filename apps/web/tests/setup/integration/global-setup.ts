/**
 * Vitest global integration test setup.
 *
 * Configures the test environment, creates isolated test databases,
 * verifies schema integrity, and sets up environment variables for
 * integration test suites.
 *
 * This file is ONLY for integration tests. Unit tests should NOT
 * require database setup and use the minimal setup in unit.ts.
 *
 * @module
 * @category Test Setup
 */
import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import { checkPostgreSQLConnection } from "@/lib/database/setup";
import { logger } from "@/lib/logger";

import { createTestDatabase } from "./database";
import { verifyDatabaseSchema } from "./schema-verification";

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}
// Note: These are test-only values, not real credentials
// Using hardcoded values for test consistency and isolation
process.env.PAYLOAD_SECRET = "test-secret-key";
process.env.NEXT_PUBLIC_PAYLOAD_URL = "http://localhost:3000";

// Payload logging is now properly controlled via logger and loggingLevels configuration

import { getTestDatabaseUrl, parseDatabaseUrl } from "../../../lib/database/url";

// Use one test database per worker for efficiency
// Workers will truncate tables between tests instead of creating new databases
const workerId = process.env.VITEST_WORKER_ID ?? "1";

// Get test database URL for this worker
const dbUrl = getTestDatabaseUrl();
const testDbName = parseDatabaseUrl(dbUrl).database;
process.env.DATABASE_URL = dbUrl;

// Use worker-specific upload directories for test isolation
process.env.UPLOAD_DIR_MEDIA = `/tmp/media-${workerId}`;
process.env.UPLOAD_DIR_IMPORT_FILES = `/tmp/test-uploads-${workerId}`;
process.env.UPLOAD_TEMP_DIR = `/tmp/temp-${workerId}`;

// Check if we're running integration tests
// In CI, always setup database for all tests (isolated per worker)
// Locally, only setup for integration tests to save time
const isIntegrationTest = (() => {
  // Always set up in CI
  if (process.env.CI) {
    return true;
  }

  // Check if we're in a test environment with workers
  if (!process.env.VITEST_WORKER_ID) {
    return false;
  }

  // For local dev, check if running integration tests
  // Since we can't reliably detect test path here, check for any integration markers
  return (
    process.argv.some((arg) => arg.includes("integration")) ||
    process.cwd().includes("integration") ||
    // If DATABASE_URL is already set to a test database, assume we need setup
    process.env.DATABASE_URL?.includes("test")
  );
})();

// Global setup to ensure clean test environment
beforeAll(async () => {
  // Skip database setup for unit tests
  if (!isIntegrationTest) {
    if (process.env.LOG_LEVEL === "debug" || process.env.CI) {
      logger.info("Skipping database setup (not an integration test)", {
        workerId,
        ci: process.env.CI,
        argv: process.argv.join(" "),
      });
    }
    return;
  }

  if (process.env.LOG_LEVEL === "debug" || process.env.CI) {
    logger.info(`Setting up test environment for worker ${workerId}`, {
      dbName: testDbName,
      isIntegrationTest,
      ci: process.env.CI,
    });
  }

  // Ensure upload directories exist
  const uploadDirs = [
    process.env.UPLOAD_DIR_MEDIA!,
    process.env.UPLOAD_DIR_IMPORT_FILES!,
    process.env.UPLOAD_TEMP_DIR!,
  ];

  uploadDirs.forEach((dir) => {
    const fullPath = path.isAbsolute(dir) ? dir : path.resolve(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });

  // Check PostgreSQL is running before attempting database operations
  try {
    await checkPostgreSQLConnection();
  } catch (error) {
    logger.error("PostgreSQL connectivity check failed");
    throw error;
  }

  // Create test database if it doesn't exist (includes PostGIS setup)
  // This will now truncate if the database already exists
  await createTestDatabase(testDbName);

  // Run migrations only if schema verification fails
  // This avoids running migrations on every test run
  try {
    // Try to verify schema first
    try {
      await verifyDatabaseSchema(dbUrl);
      // Schema is valid, no need to run migrations
      if (process.env.LOG_LEVEL === "debug") {
        logger.info(`Using existing schema for worker ${workerId}`);
      }
    } catch (schemaError) {
      // Schema verification failed, run migrations
      if (process.env.LOG_LEVEL === "debug" || process.env.CI) {
        logger.info(`Running migrations for worker ${workerId}`, {
          reason: schemaError instanceof Error ? schemaError.message : "Schema verification failed",
        });
      }
      const { execSync } = await import("child_process");
      execSync("pnpm --filter web payload migrate", { stdio: "inherit" });

      // Verify again after migration
      await verifyDatabaseSchema(dbUrl);
    }

    // Log successful setup for debugging
    if (process.env.LOG_LEVEL === "debug" || process.env.CI) {
      logger.info(`Database setup completed for worker ${workerId}`, {
        dbName: testDbName,
        dbUrl: dbUrl.replace(/:[^:@]+@/, ":***@"), // Hide password
      });
    }
  } catch (error) {
    // Always show migration errors, regardless of log level
    logger.error(`Migration FAILED for global setup ${testDbName}:`, error);
    throw error;
  }
});

// Global teardown to clean up
afterAll(() => {
  // Clean up upload directories
  const uploadDirs = [
    process.env.UPLOAD_DIR_MEDIA!,
    process.env.UPLOAD_DIR_IMPORT_FILES!,
    process.env.UPLOAD_TEMP_DIR!,
  ];
  uploadDirs.forEach((dir) => {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // Don't drop the database - leave it for debugging if needed
  // The next test run will reuse it
});

// Import centralized mocks only for non-E2E tests
// eslint-disable-next-line turbo/no-undeclared-env-vars
if (!process.env.PLAYWRIGHT_TEST) {
  void import("../../mocks/external/next-navigation");
}
