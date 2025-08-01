// Vitest setup file
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import { logger } from "@/lib/logger";

import { createTestDatabase } from "./database-setup";
import { verifyDatabaseSchema } from "./verify-schema";

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}
process.env.PAYLOAD_SECRET = "test-secret-key";
process.env.NEXT_PUBLIC_PAYLOAD_URL = "http://localhost:3000";

// Payload logging is now properly controlled via logger and loggingLevels configuration

// Create isolated test database for each worker
const workerId = process.env.VITEST_WORKER_ID ?? "1";
const testDbName = `timetiles_test_${workerId}`;
const dbUrl = `postgresql://timetiles_user:timetiles_password@localhost:5432/${testDbName}`;
process.env.DATABASE_URL = dbUrl;

// Create unique temp directory for each test worker
const tempDir = `/tmp/timetiles-test-${workerId}-${randomUUID()}`;
process.env.TEMP_DIR = tempDir;

process.env.UPLOAD_DIR_MEDIA = `/tmp/media`;
process.env.UPLOAD_DIR_IMPORT_FILES = `/tmp/import-files`;
process.env.UPLOAD_TEMP_DIR = `/tmp/temp`;

// Global setup to ensure clean test environment
beforeAll(async () => {
  if (process.env.LOG_LEVEL && process.env.LOG_LEVEL !== "silent") {
    logger.info(`Setting up test environment for worker ${workerId}`);
  }

  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
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

  // Create test database if it doesn't exist (includes PostGIS setup)
  await createTestDatabase(testDbName);

  // Run migrations to ensure database schema is up to date
  try {
    const { getPayload } = await import("payload");
    const { createTestConfig } = await import("../../lib/config/payload-config-factory");

    logger.info(`Creating test config with database URL: ${dbUrl}`);

    const testConfig = await createTestConfig({
      databaseUrl: dbUrl,
      logLevel: (process.env.LOG_LEVEL as any) || "silent",
    });

    logger.info("Test config created, initializing Payload...");

    const payload = await getPayload({ config: testConfig });
    await payload.db.migrate();

    // Verify the schema was created correctly
    await verifyDatabaseSchema(dbUrl);
  } catch (error) {
    // Always show migration errors, regardless of log level
    logger.error(`Migration FAILED for global setup ${testDbName}:`, error);
    throw error;
  }
});

// Global teardown to clean up
afterAll(() => {
  // Clean up temp directory
  if (fs.existsSync(tempDir)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }

  // Don't drop the database - leave it for debugging if needed
  // The next test run will reuse it
});

// Import centralized mocks
import "../mocks/external/next-navigation";
