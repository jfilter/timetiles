// Vitest setup file
import { beforeAll, afterAll, vi } from "vitest";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";

import { createTestDatabase, truncateAllTables } from "./database-setup";

// Mock the logger to hide noisy output in tests
vi.mock("../lib/logger", () => {
  const mockedLogger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    logger: {
      ...mockedLogger,
      child: () => mockedLogger,
    },
    createLogger: () => mockedLogger,
    createRequestLogger: () => mockedLogger,
    createJobLogger: () => mockedLogger,
    logPerformance: vi.fn(),
    logError: vi.fn(),
  };
});

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}
process.env.PAYLOAD_SECRET = "test-secret-key";

// Create isolated test database for each worker
const workerId = process.env.VITEST_WORKER_ID || "1";
const testDbName = `timetiles_test_${workerId}`;
const dbUrl = `postgresql://timetiles_user:timetiles_password@localhost:5432/${testDbName}`;
process.env.DATABASE_URL = dbUrl;

// Create unique temp directory for each test worker
const tempDir = `/tmp/timetiles-test-${workerId}-${randomUUID()}`;
process.env.TEMP_DIR = tempDir;

// --- Migration and Database Locking ---
const lockDir = path.join("/tmp", `migration-lock-${workerId}`);

async function waitForLock(maxWaitTime = 60000, pollInterval = 100) {
  const startTime = Date.now();
  while (fs.existsSync(lockDir)) {
    if (Date.now() - startTime > maxWaitTime) {
      // Try to force cleanup the lock as a last resort
      try {
        fs.rmSync(lockDir, { recursive: true, force: true });
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      throw new Error("Timeout waiting for migration lock");
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

async function runMigrations() {
  let lockAcquired = false;
  try {
    // Attempt to create lock
    fs.mkdirSync(lockDir);
    lockAcquired = true;

    // Run migrations
    execSync("pnpm payload migrate", { stdio: "pipe" });
  } catch (error: any) {
    if (error.code === "EEXIST") {
      // Lock exists, wait for it to be released
      await waitForLock();
      // After waiting, try to run migrations again
      try {
        fs.mkdirSync(lockDir);
        lockAcquired = true;
        execSync("pnpm payload migrate", { stdio: "pipe" });
      } catch (retryError) {
        // If we still can't get the lock or run migrations, that's fine
        // The migrations might have been run by another process
      }
    } else {
      throw error;
    }
  } finally {
    // Release lock only if we acquired it
    if (lockAcquired && fs.existsSync(lockDir)) {
      try {
        fs.rmSync(lockDir, { recursive: true, force: true });
      } catch (cleanupError) {
        // Ignore cleanup errors - process might be shutting down
      }
    }
  }
}

// Global setup to ensure clean test environment
beforeAll(async () => {
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create test database if it doesn't exist
  await createTestDatabase(testDbName);

  // Run migrations with locking to prevent race conditions
  await runMigrations();

  // Truncate all tables before each test suite
  await truncateAllTables();
});
