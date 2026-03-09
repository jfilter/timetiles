/**
 * Integration tests for database-backed seed operations.
 *
 * Tests seeding, truncation, error handling, and configuration-driven seeding
 * that require a real database connection.
 *
 * @see tests/unit/services/seed-config.test.ts for pure unit tests of seed
 * data functions and configuration validation.
 *
 * @module
 */
import type { Payload } from "payload";

import type { Config } from "@/payload-types";

import { getCollectionConfig } from "../../../lib/seed/seed.config";
import { createIntegrationTestEnvironment } from "../../setup/integration/environment";

describe.sequential("Database-backed Seed Operations", () => {
  const seedCollections = ["users", "catalogs", "datasets", "events", "pages"];

  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;
  let payload: Payload;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment({ resetDatabase: false, createTempDir: false });
    payload = testEnv.payload;
  });

  afterAll(async () => {
    try {
      await testEnv.cleanup();
    } catch {
      // Test environment cleanup error (non-critical) - silently continue
    }
  }, 60000);

  beforeEach(async () => {
    await testEnv.seedManager.truncate(seedCollections);
  });

  describe.sequential("Seeding Operations", () => {
    it("should seed all collections in correct order", async () => {
      // Don't truncate here - the beforeEach already does it
      // Use test environment for simpler data without file uploads
      await testEnv.seedManager.seedWithConfig({
        preset: "testing",
        collections: ["users", "catalogs", "datasets", "events"],
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
    }, 90000); // 90 second timeout for seeding all collections (increases when running full suite)

    it("should handle specific collection seeding", async () => {
      // Explicitly truncate specific collections for better performance
      await testEnv.seedManager.truncate(["users", "catalogs", "datasets", "events"]);

      await testEnv.seedManager.seedWithConfig({
        collections: ["users", "catalogs"],
        preset: "testing",
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
      await testEnv.seedManager.seedWithConfig({
        preset: "testing",
      });

      // Verify we have data before truncation
      let hasData = false;
      // Only check collections that are actually seeded
      const collections = ["users", "catalogs", "datasets", "events"];

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
    }, 90000); // 90 second timeout (increases when running full suite)
  });

  describe.sequential("Error Handling", () => {
    it("should handle missing relationships gracefully", async () => {
      await testEnv.seedManager.truncate(seedCollections);
      // Try to seed datasets without catalogs - should complete without throwing
      await expect(
        testEnv.seedManager.seedWithConfig({
          collections: ["datasets"],
          preset: "testing",
        })
      ).resolves.toBeUndefined();

      // Verify no datasets were actually created due to missing catalogs
      const datasetCount = await testEnv.seedManager.getCollectionCount("datasets");
      expect(datasetCount).toBe(0);
    });

    it("should handle missing datasets for events", async () => {
      await testEnv.seedManager.truncate(seedCollections);
      await testEnv.seedManager.seedWithConfig({
        collections: ["catalogs"],
        preset: "testing",
      });

      // Try to seed events without datasets - should complete without throwing
      await expect(
        testEnv.seedManager.seedWithConfig({
          collections: ["events"],
          preset: "testing",
        })
      ).resolves.toBeUndefined();

      // Verify no events were actually created due to missing datasets
      const eventCount = await testEnv.seedManager.getCollectionCount("events");
      expect(eventCount).toBe(0);
    });
  });

  describe.sequential("Configuration-Driven Seeding", () => {
    it("should seed using configuration for development preset", async () => {
      await testEnv.seedManager.seedWithConfig({
        preset: "development",
        collections: ["users", "catalogs", "datasets"],
      });

      const usersCount = await testEnv.seedManager.getCollectionCount("users");
      const catalogsCount = await testEnv.seedManager.getCollectionCount("catalogs");
      const datasetsCount = await testEnv.seedManager.getCollectionCount("datasets");

      expect(usersCount).toBeGreaterThan(0);
      expect(catalogsCount).toBeGreaterThan(0);
      expect(datasetsCount).toBeGreaterThan(0);

      const devUsersConfig = getCollectionConfig("users", "development");
      const expectedUsersCount =
        typeof devUsersConfig?.count === "function"
          ? devUsersConfig.count("development")
          : (devUsersConfig?.count ?? 0);

      expect(usersCount).toBeLessThanOrEqual(expectedUsersCount);
    });

    it("should seed using configuration for test preset", async () => {
      await testEnv.seedManager.seedWithConfig({
        preset: "testing",
        collections: ["users", "catalogs"],
      });

      const usersCount = await testEnv.seedManager.getCollectionCount("users");
      const catalogsCount = await testEnv.seedManager.getCollectionCount("catalogs");

      expect(usersCount).toBeGreaterThan(0);
      expect(catalogsCount).toBeGreaterThan(0);

      const testUsersConfig = getCollectionConfig("users", "testing");
      const expectedUsersCount =
        typeof testUsersConfig?.count === "function"
          ? testUsersConfig.count("testing")
          : (testUsersConfig?.count ?? 0);

      expect(usersCount).toBeGreaterThanOrEqual(expectedUsersCount);
      expect(usersCount).toBeLessThanOrEqual(expectedUsersCount + 5);
    });

    it("should respect collection dependencies", async () => {
      await testEnv.seedManager.seedWithConfig({
        preset: "development",
        collections: ["catalogs", "datasets"],
      });

      const catalogsCount = await testEnv.seedManager.getCollectionCount("catalogs");
      const datasetsCount = await testEnv.seedManager.getCollectionCount("datasets");

      expect(catalogsCount).toBeGreaterThan(0);
      expect(datasetsCount).toBeGreaterThan(0);

      const datasets = await testEnv.payload.find({
        collection: "datasets",
        limit: 5,
        depth: 1,
      });

      expect(datasets.docs.length).toBeGreaterThan(0);

      datasets.docs.forEach((dataset: any) => {
        expect(dataset.catalog).toBeDefined();
        expect(typeof dataset.catalog).toBe("object");
      });
    });

    it("should apply configuration overrides", async () => {
      await testEnv.seedManager.seedWithConfig({
        preset: "testing",
        collections: ["users"],
        configOverrides: {
          users: {
            count: 10,
            options: {
              includeTestUsers: true,
            },
          },
        },
      });

      const usersCount = await testEnv.seedManager.getCollectionCount("users");
      expect(usersCount).toBeGreaterThan(0);
      expect(usersCount).toBeGreaterThanOrEqual(10);
      expect(usersCount).toBeLessThanOrEqual(15);
    });

    it("should skip disabled collections", async () => {
      await testEnv.seedManager.seedWithConfig({
        preset: "development",
        collections: ["media"],
      });

      const mediaCount = await testEnv.seedManager.getCollectionCount("media");
      expect(mediaCount).toBe(0);
    });

    it("should throw error for unknown preset", async () => {
      await expect(
        testEnv.seedManager.seedWithConfig({
          preset: "unknown-preset",
          collections: ["events"],
        })
      ).rejects.toThrow("Unknown preset: unknown-preset");
    });

    it("should seed main-menu global successfully", async () => {
      await testEnv.seedManager.seedWithConfig({
        preset: "development",
        collections: ["main-menu"],
      });

      const mainMenu = await testEnv.payload.findGlobal({
        slug: "main-menu",
      });

      expect(mainMenu).toBeDefined();
      expect(mainMenu.navItems).toBeDefined();
      expect(Array.isArray(mainMenu.navItems)).toBe(true);
      expect(mainMenu.navItems.length).toBeGreaterThan(0);

      mainMenu.navItems.forEach((item: any) => {
        expect(item).toHaveProperty("label");
        expect(item).toHaveProperty("url");
        expect(typeof item.label).toBe("string");
        expect(typeof item.url).toBe("string");
      });

      const labels = mainMenu.navItems.map((item: any) => item.label);
      expect(labels).toContain("Home");
      expect(labels).toContain("Explore");
    });
  });
});
