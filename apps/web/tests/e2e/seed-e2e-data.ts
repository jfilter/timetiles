/**
 * Shared E2E seeding step for the Playwright global setup and the standalone setup script.
 *
 * @module
 * @category E2E Setup
 */
import { resetEnv } from "@/lib/config/env";

import { E2E_SEED_COLLECTIONS } from "./config";

/**
 * Truncate `databaseUrl` and seed the e2e preset into it.
 *
 * The seed manager resolves its connection through the cached `getEnv()` singleton, so the
 * swapped `DATABASE_URL` only takes effect after `resetEnv()` — without it the seed lands in
 * whichever database was read first.
 */
export const seedE2ETestData = async (databaseUrl: string): Promise<void> => {
  const originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = databaseUrl;
  resetEnv();

  let seedManager;
  try {
    const { createSeedManager } = await import("@/lib/seed/index");

    seedManager = createSeedManager();
    await seedManager.truncate();
    await seedManager.seedWithConfig({ preset: "e2e", collections: [...E2E_SEED_COLLECTIONS] });
    console.log("✅ Seeded E2E test data");
  } finally {
    if (seedManager) {
      await seedManager.cleanup();
    }
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    }
    resetEnv();
  }
};
