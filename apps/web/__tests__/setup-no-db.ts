// Vitest setup file for tests that don't need database
import { vi } from "vitest";
import { randomUUID } from "crypto";
import fs from "fs";

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
    createTestLogger: () => mockedLogger,
    perfStart: () => ({ end: vi.fn().mockReturnValue(10) }),
    logPerformance: vi.fn(),
    logError: vi.fn(),
  };
});

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
