import { chromium, FullConfig } from "@playwright/test";
import { SeedManager } from "../lib/seed";

async function globalSetup(config: FullConfig) {
  console.log("🌱 Seeding database for E2E tests...");

  const seedManager = new SeedManager();

  try {
    // Check if we already have the expected data to avoid unnecessary seeding
    const payload = await seedManager.initialize();
    const catalogCount = await seedManager.getCollectionCount("catalogs");
    const datasetCount = await seedManager.getCollectionCount("datasets");
    
    if (catalogCount >= 2 && datasetCount >= 2) {
      console.log("✅ Database already has sufficient test data, skipping seeding");
      return;
    }

    // For E2E tests, we want a clean, predictable state
    // First try to truncate and seed fresh data (include imports to avoid foreign key issues)
    await seedManager.seed({
      environment: "development",
      truncate: true,
      collections: ["users", "catalogs", "datasets", "events", "imports"],
    });

    console.log("✅ Database seeded successfully with fresh data");
  } catch (error) {
    console.error("❌ Failed to seed database with truncation:", error);
    
    try {
      // Fallback: try to seed without truncation but skip conflicting users
      console.log("🔄 Attempting to seed without truncation...");
      await seedManager.seed({
        environment: "development",
        truncate: false,
        collections: ["catalogs", "datasets", "events", "imports"], // Skip users to avoid conflicts
      });
      console.log("✅ Database seeded successfully (partial - skipped users)");
    } catch (fallbackError) {
      console.error("❌ Fallback seeding also failed:", fallbackError);
      console.log("⚠️ Continuing with existing database data");
    }
  } finally {
    await seedManager.cleanup();
  }
}

export default globalSetup;
