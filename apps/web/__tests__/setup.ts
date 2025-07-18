// Vitest setup file
import { beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs";

import { createTestDatabase } from "./database-setup";

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

// Global setup to ensure clean test environment
beforeAll(async () => {
  console.log(`Setting up test environment for worker ${workerId}`);
  console.log(`Test database: ${testDbName}`);
  console.log(`DATABASE_URL: ${dbUrl}`);
  
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create test database if it doesn't exist (includes PostGIS setup)
  await createTestDatabase(testDbName);
  
  console.log(`Test environment setup complete for worker ${workerId}`);
});
