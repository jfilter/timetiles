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
import { vi } from "vitest";

// Load environment variables from repo root — .env.local overrides .env
// process.cwd() is apps/web/, but .env lives at the monorepo root
const repoRoot = path.resolve(process.cwd(), "../..");
dotenv.config({ path: path.resolve(repoRoot, ".env") });
dotenv.config({ path: path.resolve(repoRoot, ".env.local"), override: true });

import { resetAppConfig } from "@/lib/config/app-config";
import { resetEnv } from "@/lib/config/env";
import { createDatabaseClient } from "@/lib/database/client";
import { cloneDatabase, databaseExists, dropDatabase } from "@/lib/database/operations";
import { checkPostgreSQLConnection } from "@/lib/database/setup";
import { logger } from "@/lib/logger";

import { createTestDatabase } from "./database";
import { verifyDatabaseSchema } from "./schema-verification";

const TEMPLATE_DB_NAME = "timetiles_test_template";

/**
 * Fallback: Setup database with migrations (original behavior).
 * Used when template cloning fails or template doesn't exist.
 */
const setupDatabaseWithMigrations = async (dbName: string, dbUrl: string, workerId: string): Promise<void> => {
  // Create test database if it doesn't exist (includes PostGIS setup)
  await createTestDatabase(dbName);

  // Run migrations only if schema verification fails
  try {
    await verifyDatabaseSchema(dbUrl);
    if (process.env.LOG_LEVEL === "debug") {
      logger.info(`Using existing schema for worker ${workerId}`);
    }
  } catch (schemaError) {
    if (process.env.LOG_LEVEL === "debug" || process.env.CI) {
      logger.info(`Running migrations for worker ${workerId}`, {
        reason: schemaError instanceof Error ? schemaError.message : "Schema verification failed",
      });
    }
    const { execSync } = await import("node:child_process");
    execSync("pnpm --filter web payload migrate", { stdio: "inherit" });

    // Verify again after migration
    await verifyDatabaseSchema(dbUrl);
  }

  if (process.env.LOG_LEVEL === "debug" || process.env.CI) {
    logger.info(`Database setup completed for worker ${workerId}`, {
      dbName,
      dbUrl: dbUrl.replace(/:[^:@]+@/, ":***@"),
      method: "migrations",
    });
  }
};

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}
// Note: These are test-only values, not real credentials
// Using hardcoded values for test consistency and isolation
process.env.PAYLOAD_SECRET = "test-secret-key";
process.env.NEXT_PUBLIC_PAYLOAD_URL = "http://localhost:3000";
// Allow private/localhost URLs in integration tests (SSRF validation bypass for test servers)
process.env.ALLOW_PRIVATE_URLS = "true";
// Disable live HIBP lookups by default in integration tests so auth suites stay
// deterministic and don't depend on the evolving compromised-password corpus.
// Tests that need the HIBP path can opt back in explicitly.
process.env.PASSWORD_HIBP_CHECK = "false";

// Payload logging is now properly controlled via logger and loggingLevels configuration

import { deriveDatabaseUrl, getDatabaseUrl, parseDatabaseUrl } from "../../../lib/database/url";

// Use one test database per fork process for efficiency.
// With isolate: false, multiple test files share a fork process (same PID).
// Use process.pid as the pool slot identifier so the DB is reused across files.
const workerId = process.env.VITEST_WORKER_ID ?? "1";
const poolSlotId = String(process.pid);

// DB URL uses process.pid (stable within fork with isolate: false)
const baseUrl = getDatabaseUrl(true)!;
const dbUrl = deriveDatabaseUrl(baseUrl, { workerId: poolSlotId });
const testDbName = parseDatabaseUrl(dbUrl).database;
process.env.DATABASE_URL = dbUrl;

// Use fork-specific upload directories for test isolation
process.env.UPLOAD_DIR = `/tmp/uploads-${poolSlotId}`;
process.env.UPLOAD_TEMP_DIR = `/tmp/temp-${poolSlotId}`;

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
    `${process.env.UPLOAD_DIR!}/media`,
    `${process.env.UPLOAD_DIR!}/ingest-files`,
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

  // With isolate: false, multiple test files share a fork process.
  // Reuse the DB if it already exists and has valid schema (avoids redundant clones).
  const dbExists = await databaseExists(testDbName);
  if (dbExists) {
    try {
      await verifyDatabaseSchema(dbUrl);

      if (process.env.LOG_LEVEL === "debug" || process.env.CI) {
        logger.info(`Reusing existing database ${testDbName} for worker ${workerId}`);
      }
      return;
    } catch {
      // Schema invalid — drop and re-clone below
      await dropDatabase(testDbName, { ifExists: true });
    }
  }

  // Try to clone from template database (fast path - created by globalSetup)
  // This is ~2s vs ~30s for running migrations
  const templateExists = await databaseExists(TEMPLATE_DB_NAME);

  if (templateExists) {
    // Fast path: Clone from template
    try {
      await cloneDatabase(TEMPLATE_DB_NAME, testDbName);

      if (process.env.LOG_LEVEL === "debug" || process.env.CI) {
        logger.info(`Cloned template to ${testDbName} for worker ${workerId}`);
      }

      // Verify the cloned database has valid schema
      await verifyDatabaseSchema(dbUrl);

      if (process.env.LOG_LEVEL === "debug" || process.env.CI) {
        logger.info(`Database setup completed for worker ${workerId}`, {
          dbName: testDbName,
          dbUrl: dbUrl.replace(/:[^:@]+@/, ":***@"),
          method: "template_clone",
        });
      }
    } catch (cloneError) {
      // Clone failed - fall back to original behavior
      logger.warn(`Clone failed for worker ${workerId}, falling back to migrations:`, cloneError);
      await setupDatabaseWithMigrations(testDbName, dbUrl, workerId);
    }
  } else {
    // No template exists - use original behavior
    // This handles the case where globalSetup didn't run (e.g., unit tests)
    if (process.env.LOG_LEVEL === "debug" || process.env.CI) {
      logger.info(`No template found, using migrations for worker ${workerId}`);
    }
    await setupDatabaseWithMigrations(testDbName, dbUrl, workerId);
  }
});

// Reset cached env/app-config before each test so in-test process.env overrides
// take effect when the source reads via getEnv() / getAppConfig().
beforeEach(() => {
  resetEnv();
  resetAppConfig();
});

// Safety net: restore all spied mocks between tests to prevent leak across files
// with isolate: false. Individual tests that need spies set them up in beforeAll/beforeEach.
afterEach(async () => {
  vi.restoreAllMocks();

  // Clean stale jobs between tests — payload.jobs.run() picks up ALL pending jobs,
  // so we must clear them to prevent cross-test interference.
  // payload_jobs has NO FK constraints, so DELETE (ROW EXCLUSIVE) never deadlocks.
  if (isIntegrationTest) {
    try {
      const client = createDatabaseClient({ connectionString: dbUrl });
      try {
        await client.connect();
        await client.query('DELETE FROM payload."payload_jobs"');
      } finally {
        await client.end();
      }
    } catch {
      // Ignore — table may not exist during initial setup
    }
  }
});

// Global teardown to clean up
afterAll(() => {
  // Clean up upload directories (clean base upload dir and temp dir)
  const uploadDirs = [process.env.UPLOAD_DIR!, process.env.UPLOAD_TEMP_DIR!];
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
