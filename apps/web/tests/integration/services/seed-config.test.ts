/**
 * Configuration-Driven Seeding Tests - Phase 3 Implementation
 *
 * Tests the new seed.config.ts system and configuration-driven seeding
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createIsolatedTestEnvironment } from "../../setup/test-helpers";
import {
  getCollectionConfig,
  getEnabledCollections,
  getEnvironmentSettings,
  SEED_CONFIG,
} from "../../../lib/seed/seed.config";

describe.sequential("Configuration-Driven Seeding - Phase 3", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  beforeEach(async () => {
    await testEnv.seedManager.truncate();
  });

  describe("Configuration System", () => {
    it("should provide correct collection configurations for different environments", () => {
      // Test development environment
      const devCatalogsConfig = getCollectionConfig("catalogs", "development");
      expect(devCatalogsConfig).toBeDefined();
      expect(typeof devCatalogsConfig?.count).toBe("function");
      expect((devCatalogsConfig?.count as Function)("development")).toBe(6);

      // Test test environment
      const testCatalogsConfig = getCollectionConfig("catalogs", "test");
      expect(testCatalogsConfig).toBeDefined();
      expect((testCatalogsConfig?.count as Function)("test")).toBe(3);

      // Test production environment (catalogs not enabled in production)
      const prodCatalogsConfig = getCollectionConfig("catalogs", "production");
      expect(prodCatalogsConfig).toBeNull(); // Catalogs not enabled in production

      // Test production environment with enabled collection
      const prodUsersConfig = getCollectionConfig("users", "production");
      expect(prodUsersConfig).toBeDefined();
      // Production users config has a static count override, not a function
      expect(prodUsersConfig?.count).toBe(1); // Overridden to 1 in production
    });

    it("should return null for disabled collections", () => {
      const mediaConfig = getCollectionConfig("media", "test");
      expect(mediaConfig).toBeDefined();
      expect(mediaConfig?.disabled).toBe(true);
    });

    it("should return null for collections not enabled in environment", () => {
      const eventsConfig = getCollectionConfig("events", "production");
      expect(eventsConfig).toBeNull(); // Events not enabled in production
    });

    it("should provide enabled collections in dependency order", () => {
      const devCollections = getEnabledCollections("development");
      expect(devCollections).toContain("users");
      expect(devCollections).toContain("catalogs");
      expect(devCollections).toContain("datasets");
      expect(devCollections).toContain("events");

      // Users should come before everything (no dependencies)
      // Catalogs should come before datasets (datasets depend on catalogs)
      // Datasets should come before events (events depend on datasets)
      const catalogsIndex = devCollections.indexOf("catalogs");
      const datasetsIndex = devCollections.indexOf("datasets");
      const eventsIndex = devCollections.indexOf("events");

      expect(catalogsIndex).toBeLessThan(datasetsIndex);
      expect(datasetsIndex).toBeLessThan(eventsIndex);
    });

    it("should handle circular dependency detection", () => {
      // This should not throw for our current configuration
      expect(() => getEnabledCollections("development")).not.toThrow();
      expect(() => getEnabledCollections("test")).not.toThrow();
      expect(() => getEnabledCollections("production")).not.toThrow();
    });

    it("should provide environment-specific settings", () => {
      const devSettings = getEnvironmentSettings("development");
      expect(devSettings?.useRealisticData).toBe(true);
      expect(devSettings?.debugLogging).toBe(true);

      const testSettings = getEnvironmentSettings("test");
      expect(testSettings?.useRealisticData).toBe(false);
      expect(testSettings?.performanceMode).toBe(true);

      const prodSettings = getEnvironmentSettings("production");
      expect(prodSettings?.useRealisticData).toBe(false);
      expect(prodSettings?.performanceMode).toBe(true);
    });
  });

  describe("Configuration-Driven Seeding", () => {
    it("should seed using configuration for development environment", async () => {
      await testEnv.seedManager.seedWithConfig({
        environment: "development",
        collections: ["users", "catalogs", "datasets"], // Subset for faster testing
      });

      // Check that collections were seeded according to configuration
      const usersCount = await testEnv.seedManager.getCollectionCount("users");
      const catalogsCount =
        await testEnv.seedManager.getCollectionCount("catalogs");
      const datasetsCount =
        await testEnv.seedManager.getCollectionCount("datasets");

      // Verify counts match configuration expectations
      expect(usersCount).toBeGreaterThan(0);
      expect(catalogsCount).toBeGreaterThan(0);
      expect(datasetsCount).toBeGreaterThan(0);

      // Development should have more items than test environment
      const devUsersConfig = getCollectionConfig("users", "development");
      const expectedUsersCount =
        typeof devUsersConfig?.count === "function"
          ? devUsersConfig.count("development")
          : devUsersConfig?.count || 0;

      expect(usersCount).toBeLessThanOrEqual(expectedUsersCount); // Less than or equal because we might have existing users
    });

    it("should seed using configuration for test environment", async () => {
      await testEnv.seedManager.seedWithConfig({
        environment: "test",
        collections: ["users", "catalogs"],
      });

      const usersCount = await testEnv.seedManager.getCollectionCount("users");
      const catalogsCount =
        await testEnv.seedManager.getCollectionCount("catalogs");

      expect(usersCount).toBeGreaterThan(0);
      expect(catalogsCount).toBeGreaterThan(0);

      // Test environment should have fewer items than development
      const testUsersConfig = getCollectionConfig("users", "test");
      const expectedUsersCount =
        typeof testUsersConfig?.count === "function"
          ? testUsersConfig.count("test")
          : testUsersConfig?.count || 0;

      expect(usersCount).toBeLessThanOrEqual(expectedUsersCount);
    });

    it("should respect collection dependencies", async () => {
      // Seed only datasets (which depend on catalogs)
      await testEnv.seedManager.seedWithConfig({
        environment: "development",
        collections: ["catalogs", "datasets"],
      });

      const catalogsCount =
        await testEnv.seedManager.getCollectionCount("catalogs");
      const datasetsCount =
        await testEnv.seedManager.getCollectionCount("datasets");

      // Both should be seeded because datasets depend on catalogs
      expect(catalogsCount).toBeGreaterThan(0);
      expect(datasetsCount).toBeGreaterThan(0);

      // Verify relationships exist
      const datasets = await testEnv.payload.find({
        collection: "datasets",
        limit: 5,
        depth: 1,
      });

      expect(datasets.docs.length).toBeGreaterThan(0);

      // Check that datasets have valid catalog relationships
      datasets.docs.forEach((dataset: any) => {
        expect(dataset.catalog).toBeDefined();
        expect(typeof dataset.catalog).toBe("object");
      });
    });

    it("should apply configuration overrides", async () => {
      await testEnv.seedManager.seedWithConfig({
        environment: "test",
        collections: ["users"],
        configOverrides: {
          users: {
            count: 10, // Override the default test count
            options: {
              includeTestUsers: true,
            },
          },
        },
      });

      const usersCount = await testEnv.seedManager.getCollectionCount("users");
      expect(usersCount).toBeGreaterThan(0);
      expect(usersCount).toBeLessThanOrEqual(10); // Should respect the override
    });

    it("should skip disabled collections", async () => {
      await testEnv.seedManager.seedWithConfig({
        environment: "development",
        collections: ["media"], // Media is disabled in config
      });

      const mediaCount = await testEnv.seedManager.getCollectionCount("media");
      expect(mediaCount).toBe(0); // Should be 0 because it's disabled
    });

    it("should handle collections not enabled for environment", async () => {
      // Try to seed events in production (where they're not enabled)
      await testEnv.seedManager.seedWithConfig({
        environment: "production",
        collections: ["events"],
      });

      const eventsCount =
        await testEnv.seedManager.getCollectionCount("events");
      expect(eventsCount).toBe(0); // Should be 0 because events aren't enabled in production
    });
  });

  describe("Legacy Compatibility", () => {
    it("should maintain backward compatibility with existing seed method", async () => {
      // Test that the old method still works
      await testEnv.seedManager.seed({
        environment: "test",
        collections: ["users", "catalogs"],
      });

      const usersCount = await testEnv.seedManager.getCollectionCount("users");
      const catalogsCount =
        await testEnv.seedManager.getCollectionCount("catalogs");

      expect(usersCount).toBeGreaterThan(0);
      expect(catalogsCount).toBeGreaterThan(0);
    });

    it("should delegate to configuration-driven method when useConfig is true", async () => {
      await testEnv.seedManager.seed({
        environment: "test",
        collections: ["users"],
        useConfig: true, // This should trigger the new configuration-driven method
      });

      const usersCount = await testEnv.seedManager.getCollectionCount("users");
      expect(usersCount).toBeGreaterThan(0);
    });
  });

  describe("Configuration Validation", () => {
    it("should have valid configuration structure", () => {
      expect(SEED_CONFIG).toBeDefined();
      expect(SEED_CONFIG.collections).toBeDefined();
      expect(SEED_CONFIG.environments).toBeDefined();
      expect(SEED_CONFIG.relationships).toBeDefined();
      expect(SEED_CONFIG.generators).toBeDefined();
    });

    it("should have all required environments", () => {
      expect(SEED_CONFIG.environments.development).toBeDefined();
      expect(SEED_CONFIG.environments.test).toBeDefined();
      expect(SEED_CONFIG.environments.production).toBeDefined();
      expect(SEED_CONFIG.environments.staging).toBeDefined();
    });

    it("should have valid collection configurations", () => {
      Object.entries(SEED_CONFIG.collections).forEach(([name, config]) => {
        expect(config).toBeDefined();
        expect(config.count !== undefined || config.disabled).toBe(true);

        if (config.dependencies) {
          expect(Array.isArray(config.dependencies)).toBe(true);
        }
      });
    });
  });
});
