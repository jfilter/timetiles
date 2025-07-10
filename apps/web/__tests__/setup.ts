// Vitest setup file
import { beforeAll, afterAll, vi } from "vitest";
import { execSync } from "child_process";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { destroyRateLimitService } from "../lib/services/RateLimitService";
import { truncateAllTables } from "./database-setup";

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
process.env.NODE_ENV = "test";
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

async function waitForLock(maxWaitTime = 20000, pollInterval = 100) {
  const startTime = Date.now();
  while (fs.existsSync(lockDir)) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new Error("Timeout waiting for migration lock");
    }
    await new Promise((resolve) => setTimeout(resolve, pollInterval));
  }
}

async function runMigrations() {
  try {
    // Attempt to create lock
    fs.mkdirSync(lockDir);

    // Run migrations
    execSync("pnpm payload migrate", { stdio: "inherit" });
  } catch (error: any) {
    if (error.code === "EEXIST") {
      // Lock exists, wait for it to be released
      await waitForLock();
    } else {
      throw error;
    }
  } finally {
    // Release lock
    if (fs.existsSync(lockDir)) {
      fs.rmdirSync(lockDir);
    }
  }
}

// Global setup to ensure clean test environment
beforeAll(async () => {
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Run migrations with locking to prevent race conditions
  if (process.env.CI) {
    await runMigrations();
  }

  // Truncate all tables before each test suite
  await truncateAllTables();
});

// Global teardown to ensure clean exit
afterAll(async () => {
  // Clean up rate limit service
  destroyRateLimitService();

  // Clean up temp directory
  try {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    // Ignore cleanup errors
  }
});
