import { createSeedManager, SeedManager } from "../lib/seed/index";
import { randomUUID } from "crypto";
import fs from "fs";
import { dropTestDatabase } from "./database-setup";

/**
 * Creates an isolated test environment for each test
 */
export async function createIsolatedTestEnvironment(): Promise<{
  seedManager: SeedManager;
  payload: any;
  cleanup: () => Promise<void>;
  tempDir: string;
}> {
  const testId = randomUUID();
  const workerId = process.env.VITEST_WORKER_ID || "1";
  const timestamp = Date.now();
  const tempDir =
    process.env.TEMP_DIR ||
    `/tmp/timetiles-test-${workerId}-${timestamp}-${testId}`;

  // Create unique temp directory for this test
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create seed manager
  const seedManager = createSeedManager();

  // Initialize payload
  const payload = await seedManager.initialize();

  if (!payload) {
    throw new Error("Failed to initialize payload");
  }

  const cleanup = async () => {
    try {
      await seedManager.cleanup();
    } catch (error) {
      console.warn("Seed manager cleanup failed:", error);
    }

    // Clean up temp directory
    try {
      if (fs.existsSync(tempDir)) {
        fs.rmSync(tempDir, { recursive: true, force: true });
      }
    } catch (error) {
      console.warn("Failed to clean up temp directory:", error);
    }

    // In local dev, drop the unique test database
    if (!process.env.CI) {
      const dbName = `timetiles_test_${workerId}_${timestamp}_${testId.replace(
        /-/g,
        "_",
      )}`;
      try {
        await dropTestDatabase(dbName);
      } catch (error) {
        console.warn("Failed to drop test database:", error);
      }
    }
  };

  return { seedManager, payload, cleanup, tempDir };
}

/**
 * Helper to create unique identifiers for tests
 */
export function createTestId(): string {
  return `test-${Date.now()}-${randomUUID().split("-")[0]}`;
}

/**
 * Helper to create unique file paths
 */
export function createTempFilePath(tempDir: string, filename: string): string {
  const testId = createTestId();
  return `${tempDir}/${testId}-${filename}`;
}
