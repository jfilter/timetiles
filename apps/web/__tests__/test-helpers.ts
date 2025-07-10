import { createSeedManager, SeedManager } from "../lib/seed/index";
import { randomUUID } from "crypto";
import {
  createTestDatabase,
  dropTestDatabase,
  getDatabaseName,
} from "./database-setup";
import type { Config } from "../payload-types";

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
  const fs = await import("fs");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Create database URL based on environment
  let dbName: string;
  let dbUrl: string;

  if (process.env.CI) {
    // In CI, use pre-created worker databases
    dbName = `timetiles_test_${workerId}`;
    dbUrl = `postgresql://timetiles_user:timetiles_password@localhost:5432/${dbName}`;
  } else {
    // Local development - create fully isolated databases
    dbName = `timetiles_test_${workerId}_${timestamp}_${testId.replace(/-/g, "_")}`;
    dbUrl = `postgresql://timetiles_user:timetiles_password@localhost:5432/${dbName}`;
  }

  // Set environment variables for this test
  const originalDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = dbUrl;

  // Create the test database
  await createTestDatabase(dbName);

  // Create seed manager
  const seedManager = createSeedManager();

  // Initialize payload with retry logic for CI
  let payload;
  let retries = process.env.CI ? 3 : 1;

  while (retries > 0) {
    try {
      payload = await seedManager.initialize();
      break;
    } catch (error: any) {
      retries--;
      if (error.message?.includes("already exists") && retries > 0) {
        // Enum already exists - wait a bit and retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
  }

  if (!payload) {
    throw new Error("Failed to initialize payload after retries");
  }

  // Run migrations on the isolated database
  try {
    if (payload.db && typeof payload.db.migrate === "function") {
      await payload.db.migrate();
    }
  } catch (error) {
    console.warn("Migration failed, continuing:", error);
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

    // Drop test database (but not in CI where we reuse databases)
    if (!process.env.CI) {
      try {
        await dropTestDatabase(dbName);
      } catch (error) {
        console.warn("Failed to drop test database:", error);
      }
    }

    // Restore original database URL
    process.env.DATABASE_URL = originalDbUrl;
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
