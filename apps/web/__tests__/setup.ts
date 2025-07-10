// Vitest setup file for seed tests
import { beforeAll, afterAll } from "vitest";
import { destroyRateLimitService } from "../lib/services/RateLimitService";
import { randomUUID } from "crypto";

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}

// Create isolated test database for each worker
const workerId = process.env.VITEST_WORKER_ID || "1";
const testDbName = `timetiles_test_${workerId}`;

// Use isolated database per worker, but fallback to main test db if worker db doesn't exist
if (!process.env.DATABASE_URL) {
  if (process.env.CI) {
    // In CI, use worker-specific database if available, otherwise use main test db
    process.env.DATABASE_URL = `postgresql://timetiles_user:timetiles_password@localhost:5432/${testDbName}`;
  } else {
    // Local development
    process.env.DATABASE_URL = `postgresql://timetiles_user:timetiles_password@localhost:5432/${testDbName}`;
  }
}

// Create unique temp directory for each test worker
const tempDir = `/tmp/timetiles-test-${workerId}-${randomUUID()}`;
process.env.TEMP_DIR = tempDir;

// Global setup to ensure clean test environment
beforeAll(async () => {
  // Ensure temp directory exists
  const fs = await import("fs");
  const path = await import("path");

  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
});

// Global teardown to ensure clean exit
afterAll(async () => {
  // Clean up rate limit service
  destroyRateLimitService();

  // Clean up temp directory
  try {
    const fs = await import("fs");
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  } catch (error) {
    // Ignore cleanup errors in test environment
  }
});
