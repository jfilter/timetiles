// Vitest setup file for tests that don't need database
import { vi } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs";

// Set test environment
if (!process.env.NODE_ENV) {
  (process.env as any).NODE_ENV = "test";
}

// Create unique temp directory for each test worker
const workerId = process.env.VITEST_WORKER_ID || "1";
const tempDir = `/tmp/timetiles-test-${workerId}-${randomUUID()}`;
process.env.TEMP_DIR = tempDir;

// Ensure temp directory exists
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}
