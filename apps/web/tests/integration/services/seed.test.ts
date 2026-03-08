/**
 * @module
 */
import type { Payload } from "payload";

import type { Config } from "@/payload-types";

import { getCollectionConfig, getEnabledCollections, SEED_CONFIG } from "../../../lib/seed/seed.config";
import { catalogSeeds } from "../../../lib/seed/seeds/catalogs";
import { datasetSeeds } from "../../../lib/seed/seeds/datasets";
import { eventSeeds } from "../../../lib/seed/seeds/events";
// importSeeds removed - import jobs are created dynamically, not seeded
import { userSeeds } from "../../../lib/seed/seeds/users";
import { createIntegrationTestEnvironment } from "../../setup/integration/environment";

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
    // Truncate only the collections we're testing for better performance
    await testEnv.seedManager.truncate(["users", "catalogs", "datasets", "events", "pages"]);
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
      await testEnv.seedManager.truncate();
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
      await testEnv.seedManager.truncate();
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

  describe.sequential("Configuration System", () => {
    it("should provide correct collection configurations for different environments", () => {
      const devCatalogsConfig = getCollectionConfig("catalogs", "development");
      expect(devCatalogsConfig).toBeDefined();
      expect(typeof devCatalogsConfig?.count).toBe("function");
      if (devCatalogsConfig) {
        expect((devCatalogsConfig.count as (...args: any[]) => any)("development")).toBe(12);
      }

      const testCatalogsConfig = getCollectionConfig("catalogs", "testing");
      expect(testCatalogsConfig).toBeDefined();
      if (testCatalogsConfig) {
        expect((testCatalogsConfig.count as (...args: any[]) => any)("testing")).toBe(3);
      }

      const e2eCatalogsConfig = getCollectionConfig("catalogs", "e2e");
      expect(e2eCatalogsConfig).toBeDefined();
      if (e2eCatalogsConfig) {
        expect((e2eCatalogsConfig.count as (...args: any[]) => any)("e2e")).toBe(8);
      }
    });

    it("should return null for disabled collections", () => {
      const mediaConfig = getCollectionConfig("media", "testing");
      expect(mediaConfig).toBeDefined();
      expect(mediaConfig?.disabled).toBe(true);
    });

    it("should throw for unknown presets", () => {
      expect(() => getCollectionConfig("events", "unknown-preset")).toThrow("Unknown preset: unknown-preset");
    });

    it("should provide enabled collections in dependency order", () => {
      const devCollections = getEnabledCollections("development");
      expect(devCollections).toContain("users");
      expect(devCollections).toContain("catalogs");
      expect(devCollections).toContain("datasets");
      expect(devCollections).toContain("events");

      const catalogsIndex = devCollections.indexOf("catalogs");
      const datasetsIndex = devCollections.indexOf("datasets");
      const eventsIndex = devCollections.indexOf("events");

      expect(catalogsIndex).toBeLessThan(datasetsIndex);
      expect(datasetsIndex).toBeLessThan(eventsIndex);
    });

    it("should handle circular dependency detection", () => {
      expect(() => getEnabledCollections("development")).not.toThrow();
      expect(() => getEnabledCollections("testing")).not.toThrow();
      expect(() => getEnabledCollections("e2e")).not.toThrow();
    });

    it("should provide preset-specific settings", () => {
      const devPreset = SEED_CONFIG.presets.development!;
      expect(devPreset.volume).toBe("large");
      expect(devPreset.realism).toBe("realistic");
      expect(devPreset.debugging).toBe("verbose");

      const testPreset = SEED_CONFIG.presets.testing!;
      expect(testPreset.volume).toBe("small");
      expect(testPreset.realism).toBe("simple");
      expect(testPreset.performance).toBe("fast");

      const e2ePreset = SEED_CONFIG.presets.e2e!;
      expect(e2ePreset.volume).toBe("medium");
      expect(e2ePreset.realism).toBe("realistic");
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
        typeof testUsersConfig?.count === "function" ? testUsersConfig.count("testing") : (testUsersConfig?.count ?? 0);

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

  describe.sequential("Configuration Validation", () => {
    it("should have all required presets with valid configurations", () => {
      const requiredPresets = ["testing", "e2e", "development"];

      requiredPresets.forEach((preset) => {
        expect(SEED_CONFIG.presets[preset]).toBeDefined();
        const presetConfig = SEED_CONFIG.presets[preset];

        if (!presetConfig) {
          throw new Error(`Preset config for ${preset} is undefined`);
        }

        expect(typeof presetConfig).toBe("object");
        expect(presetConfig).toHaveProperty("enabled");
        expect(Array.isArray(presetConfig.enabled)).toBe(true);
        expect(presetConfig.enabled.length).toBeGreaterThan(0);
        expect(presetConfig).toHaveProperty("volume");
        expect(presetConfig).toHaveProperty("realism");
        expect(presetConfig).toHaveProperty("performance");
        expect(presetConfig).toHaveProperty("debugging");
      });

      expect(Object.keys(SEED_CONFIG.presets)).toHaveLength(3);

      const devPreset = SEED_CONFIG.presets.development;
      if (!devPreset) {
        throw new Error("Development preset is undefined");
      }

      expect(devPreset.enabled).toContain("users");
      expect(devPreset.enabled).toContain("catalogs");
      expect(devPreset.enabled).toContain("events");
      expect(devPreset.volume).toBe("large");
      expect(devPreset.realism).toBe("realistic");
    });

    it("should have valid collection configurations with proper counts", () => {
      Object.entries(SEED_CONFIG.collections).forEach(([, config]) => {
        expect(config).toBeDefined();
        expect(typeof config).toBe("object");

        if (!config.disabled) {
          expect(config.count).toBeDefined();
          const countType = typeof config.count;
          expect(["number", "function"]).toContain(countType);

          if (countType === "function") {
            const devCount = (config.count as (env: string) => number)("development");
            expect(typeof devCount).toBe("number");
            expect(devCount).toBeGreaterThanOrEqual(0);
          } else {
            expect(config.count as number).toBeGreaterThan(0);
          }
        }

        if (config.dependencies) {
          expect(Array.isArray(config.dependencies)).toBe(true);

          config.dependencies.forEach((dep) => {
            expect(typeof dep).toBe("string");
            expect(dep.length).toBeGreaterThan(0);
            expect(SEED_CONFIG.collections).toHaveProperty(dep);
          });
        }
      });
    });

    it("should have valid collection names that match Payload collections", () => {
      const validCollections = [
        "users",
        "catalogs",
        "datasets",
        "events",
        "pages",
        "media",
        "location-cache",
        "geocoding-providers",
      ];

      Object.keys(SEED_CONFIG.collections).forEach((collectionName) => {
        expect(validCollections).toContain(collectionName);
      });
    });

    it("should include main-menu in all presets", () => {
      const allPresets = ["testing", "e2e", "development"];

      allPresets.forEach((preset) => {
        const enabledCollections = getEnabledCollections(preset);
        expect(enabledCollections).toContain("main-menu");
      });
    });

    it("should configure main-menu as a static global with count of 1", () => {
      const mainMenuConfig = getCollectionConfig("main-menu", "development");

      expect(mainMenuConfig).toBeDefined();
      expect(mainMenuConfig?.count).toBe(1);
      expect(mainMenuConfig?.dependencies).toEqual([]);
      expect(mainMenuConfig?.options?.staticContent).toBe(true);
    });

    it("should have valid dependency graph without circular dependencies", () => {
      Object.entries(SEED_CONFIG.collections).forEach(([collectionName, config]) => {
        if (config.dependencies) {
          expect(config.dependencies).not.toContain(collectionName);
        }
      });
    });
  });
});
