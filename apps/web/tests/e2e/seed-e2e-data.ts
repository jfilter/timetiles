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

  // The e2e geocoding provider row stores the stub server's URL, so it can only be written
  // while that server is alive. The standalone setup script exits right after seeding and has
  // no stub — seeding it there raised "E2E_GEOCODING_STUB_URL is not set" and left the run
  // reporting a failed collection. Playwright's global setup truncates and re-seeds with the
  // live stub anyway, so skipping it here loses nothing.
  // eslint-disable-next-line turbo/no-undeclared-env-vars -- E2E-only env var set by global-setup
  const hasGeocodingStub = Boolean(process.env.E2E_GEOCODING_STUB_URL);
  const collections = E2E_SEED_COLLECTIONS.filter(
    (collection) => hasGeocodingStub || collection !== "geocoding-providers"
  );

  let seedManager;
  try {
    const { createSeedManager } = await import("@/lib/seed/index");

    seedManager = createSeedManager();
    await seedManager.truncate();
    await seedManager.seedWithConfig({ preset: "e2e", collections: [...collections] });
    console.log(`✅ Seeded E2E test data${hasGeocodingStub ? "" : " (without geocoding providers — no stub)"}`);
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
