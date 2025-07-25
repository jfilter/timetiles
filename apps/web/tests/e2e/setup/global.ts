import type { FullConfig } from "@playwright/test";
import { chromium } from "@playwright/test";

import { SeedManager } from "../../../lib/seed";

const globalSetup = async (config: FullConfig) => {

  const seedManager = new SeedManager();

  try {
    // Check if we already have the expected data to avoid unnecessary seeding
    const payload = await seedManager.initialize();
    const catalogCount = await seedManager.getCollectionCount("catalogs");
    const datasetCount = await seedManager.getCollectionCount("datasets");

    if (catalogCount >= 2 && datasetCount >= 2) {
      return;
    }

    // For E2E tests, we want a clean, predictable state
    // First try to truncate and seed fresh data (include imports to avoid foreign key issues)
    await seedManager.seed({
      environment: "development",
      truncate: true,
      collections: ["users", "catalogs", "datasets", "events", "imports"],
    });

  } catch (error) {
    try {
      // Fallback: try to seed without truncation but skip conflicting users
      await seedManager.seed({
        environment: "development",
        truncate: false,
        collections: ["catalogs", "datasets", "events", "imports"], // Skip users to avoid conflicts
      });
    } catch (fallbackError) {
    }
  } finally {
    await seedManager.cleanup();
  }
};

export default globalSetup;
