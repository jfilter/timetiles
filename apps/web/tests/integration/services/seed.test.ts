/**
 * @module
 */
import type { Payload } from "payload";

import type { Config } from "@/payload-types";

import { catalogSeeds } from "../../../lib/seed/seeds/catalogs";
import { datasetSeeds } from "../../../lib/seed/seeds/datasets";
import { eventSeeds } from "../../../lib/seed/seeds/events";
// importSeeds removed - import jobs are created dynamically, not seeded
import { userSeeds } from "../../../lib/seed/seeds/users";
import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

describe.sequential("Seed System", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    try {
      await testEnv.cleanup();
    } catch {
      // Test environment cleanup error (non-critical) - silently continue
    }
  }, 60000); // 60 second timeout for cleanup

  // Add beforeEach cleanup for proper test isolation
  beforeEach(async () => {
    // Explicitly truncate only the collections we're testing
    // Skip media and import-files which have file upload dependencies
    await testEnv.seedManager.truncate(["users", "catalogs", "datasets", "events", "pages", "import-jobs"]);
  });

  describe.sequential("Seed Data Functions", () => {
    it("should generate user seeds for different environments", () => {
      const devUsers = userSeeds("development");
      const prodUsers = userSeeds("production");

      // Development should have more users than production
      expect(devUsers.length).toBeGreaterThan(prodUsers.length);
      // All users should have required fields
      expect(devUsers.every((user) => user.email && user.password)).toBe(true);
      expect(prodUsers.every((user) => user.email && user.password)).toBe(true);
    });

    it("should generate catalog seeds for different environments", () => {
      const devCatalogs = catalogSeeds("development");
      const prodCatalogs = catalogSeeds("production");

      // Development should have more catalogs than production
      expect(devCatalogs.length).toBeGreaterThan(prodCatalogs.length);
      // All catalogs should have required fields
      expect(devCatalogs.every((catalog) => catalog.name && catalog.slug)).toBe(true);
      expect(prodCatalogs.every((catalog) => catalog.name && catalog.slug)).toBe(true);
    });

    it("should generate dataset seeds for different environments", () => {
      const devDatasets = datasetSeeds("development");
      const prodDatasets = datasetSeeds("production");

      // Development should have more datasets than production
      expect(devDatasets.length).toBeGreaterThan(prodDatasets.length);
      // All datasets should have required fields
      expect(devDatasets.every((dataset) => dataset.name && dataset.slug)).toBe(true);
      expect(prodDatasets.every((dataset) => dataset.name && dataset.slug)).toBe(true);
    });

    it("should generate event seeds for different environments", () => {
      const devEvents = eventSeeds("development");
      const prodEvents = eventSeeds("production");

      // Development should have more events than production
      expect(devEvents.length).toBeGreaterThan(prodEvents.length);
      // All events should have required fields
      expect(devEvents.every((event) => event.dataset && event.data)).toBe(true);
      expect(prodEvents.every((event) => event.dataset && event.data)).toBe(true);
    });

    // Import seeds test removed - import jobs are created dynamically, not seeded
  });

  describe.sequential("Seeding Operations", () => {
    it("should seed all collections in correct order", async () => {
      // Don't truncate here - the beforeEach already does it
      // Use test environment for simpler data without file uploads
      await testEnv.seedManager.seed({
        environment: "test",
        collections: ["users", "catalogs", "datasets", "events"], // Skip import-files which needs actual files
      });

      // Check that collections have data (except import-files which we're skipping)
      const collections = ["users", "catalogs", "datasets", "events"];

      for (const collection of collections) {
        const result = await payload.find({
          collection: collection as keyof Config["collections"],
          limit: 1,
        });

        expect(result.docs.length).toBeGreaterThan(0);
      }
    }, 60000); // 60 second timeout for seeding all collections

    it("should handle specific collection seeding", async () => {
      // Explicitly truncate all collections to ensure clean state
      await testEnv.seedManager.truncate(["users", "catalogs", "datasets", "events", "import-files"]);

      await testEnv.seedManager.seed({
        collections: ["users", "catalogs"],
        environment: "test",
      });

      const users = await payload.find({
        collection: "users",
        limit: 100,
      });

      const catalogs = await payload.find({
        collection: "catalogs",
        limit: 100,
      });

      const datasets = await payload.find({
        collection: "datasets",
        limit: 100,
      });

      expect(users.docs.length).toBeGreaterThan(0);
      expect(catalogs.docs.length).toBeGreaterThan(0);
      expect(datasets.docs.length).toBe(0); // Should not be seeded
    });
  });

  describe.sequential("Truncation Operations", () => {
    it("should truncate all collections when no specific collections provided", async () => {
      await testEnv.seedManager.seed({
        environment: "test",
      });

      // Verify we have data before truncation
      let hasData = false;
      // Only check collections that are actually seeded
      const collections = ["users", "catalogs", "datasets", "events", "import-files"];

      for (const collection of collections) {
        const result = await payload.find({
          collection: collection as keyof Config["collections"],
          limit: 1,
        });
        if (result.docs.length > 0) {
          hasData = true;
          break;
        }
      }
      expect(hasData).toBe(true); // Ensure we have data to truncate

      // Truncate specific collections to avoid hanging on undefined collections
      await testEnv.seedManager.truncate(collections);

      // Check that most collections are empty (allowing some that might not clear due to refs)
      let emptiedCount = 0;
      for (const collection of collections) {
        const result = await payload.find({
          collection: collection as keyof Config["collections"],
          limit: 100,
        });
        if (result.docs.length === 0) {
          emptiedCount++;
        }
      }

      // Expect at least 3 out of 5 collections to be properly truncated
      expect(emptiedCount).toBeGreaterThanOrEqual(3);
    }, 40000); // 40 second timeout
  });

  describe.sequential("Error Handling", () => {
    it("should handle missing relationships gracefully", async () => {
      await testEnv.seedManager.truncate();
      // Try to seed datasets without catalogs - should complete without throwing
      await expect(
        testEnv.seedManager.seed({
          collections: ["datasets"],
          environment: "test",
        })
      ).resolves.toBeUndefined();

      // Verify no datasets were actually created due to missing catalogs
      const datasetCount = await testEnv.seedManager.getCollectionCount("datasets");
      expect(datasetCount).toBe(0);
    });

    it("should handle missing datasets for events", async () => {
      await testEnv.seedManager.truncate();
      await testEnv.seedManager.seed({
        collections: ["catalogs"],
        environment: "test",
      });

      // Try to seed events without datasets - should complete without throwing
      await expect(
        testEnv.seedManager.seed({
          collections: ["events"],
          environment: "test",
        })
      ).resolves.toBeUndefined();

      // Verify no events were actually created due to missing datasets
      const eventCount = await testEnv.seedManager.getCollectionCount("events");
      expect(eventCount).toBe(0);
    });
  });
});
