import { createSeedManager, SeedManager } from "../lib/seed/index";
import { randomUUID } from "crypto";
import {
  createTestDatabase,
  dropTestDatabase,
  getDatabaseName,
} from "./database-setup";

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

  // Create isolated database with timestamp for uniqueness
  const dbName = `timetiles_test_${workerId}_${timestamp}_${testId.replace(/-/g, "_")}`;
  const dbUrl = `postgresql://timetiles_user:timetiles_password@localhost:5432/${dbName}`;

  // Set environment variables for this test
  const originalDbUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = dbUrl;

  // Create the test database
  await createTestDatabase(dbName);

  // Create seed manager
  const seedManager = createSeedManager();
  const payload = await seedManager.initialize();

  // Run migrations on the isolated database
  try {
    await (payload as any).migrate();
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

    // Drop test database
    await dropTestDatabase(dbName);

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
