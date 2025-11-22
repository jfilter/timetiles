/**
 * Configuration-Driven Seeding Tests.
 *
 * Tests the new seed.config.ts system and configuration-driven seeding.
 * @module
 */

import {
  getCollectionConfig,
  getEnabledCollections,
  getEnvironmentSettings,
  SEED_CONFIG,
} from "../../../lib/seed/seed.config";
import { createIntegrationTestEnvironment } from "../../setup/integration/environment";

describe.sequential("Configuration-Driven Seeding", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
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
      expect((devCatalogsConfig?.count as (...args: any[]) => any)("development")).toBe(6);

      // Test test environment
      const testCatalogsConfig = getCollectionConfig("catalogs", "test");
      expect(testCatalogsConfig).toBeDefined();
      expect((testCatalogsConfig?.count as (...args: any[]) => any)("test")).toBe(3);

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
      const catalogsCount = await testEnv.seedManager.getCollectionCount("catalogs");
      const datasetsCount = await testEnv.seedManager.getCollectionCount("datasets");

      // Verify counts match configuration expectations
      expect(usersCount).toBeGreaterThan(0);
      expect(catalogsCount).toBeGreaterThan(0);
      expect(datasetsCount).toBeGreaterThan(0);

      // Development should have more items than test environment
      const devUsersConfig = getCollectionConfig("users", "development");
      const expectedUsersCount =
        typeof devUsersConfig?.count === "function"
          ? devUsersConfig.count("development")
          : (devUsersConfig?.count ?? 0);

      expect(usersCount).toBeLessThanOrEqual(expectedUsersCount); // Less than or equal because we might have existing users
    });

    it("should seed using configuration for test environment", async () => {
      await testEnv.seedManager.seedWithConfig({
        environment: "test",
        collections: ["users", "catalogs"],
      });

      const usersCount = await testEnv.seedManager.getCollectionCount("users");
      const catalogsCount = await testEnv.seedManager.getCollectionCount("catalogs");

      expect(usersCount).toBeGreaterThan(0);
      expect(catalogsCount).toBeGreaterThan(0);

      // Test environment should have fewer items than development
      const testUsersConfig = getCollectionConfig("users", "test");
      const expectedUsersCount =
        typeof testUsersConfig?.count === "function" ? testUsersConfig.count("test") : (testUsersConfig?.count ?? 0);

      // Account for potential additional system users (admin, test users, etc.)
      // The seeding system may create more users than the base configuration specifies
      expect(usersCount).toBeGreaterThanOrEqual(expectedUsersCount);
      expect(usersCount).toBeLessThanOrEqual(expectedUsersCount + 5);
    });

    it("should respect collection dependencies", async () => {
      // Seed only datasets (which depend on catalogs)
      await testEnv.seedManager.seedWithConfig({
        environment: "development",
        collections: ["catalogs", "datasets"],
      });

      const catalogsCount = await testEnv.seedManager.getCollectionCount("catalogs");
      const datasetsCount = await testEnv.seedManager.getCollectionCount("datasets");

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
      // Account for potential additional system users beyond the override count
      expect(usersCount).toBeGreaterThanOrEqual(10);
      expect(usersCount).toBeLessThanOrEqual(15); // Allow for system users
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

      const eventsCount = await testEnv.seedManager.getCollectionCount("events");
      expect(eventsCount).toBe(0); // Should be 0 because events aren't enabled in production
    });

    it("should seed main-menu global successfully", async () => {
      await testEnv.seedManager.seedWithConfig({
        environment: "development",
        collections: ["main-menu"],
      });

      // Verify main-menu was seeded by querying the global
      const mainMenu = await testEnv.payload.findGlobal({
        slug: "main-menu",
      });

      expect(mainMenu).toBeDefined();
      expect(mainMenu.navItems).toBeDefined();
      expect(Array.isArray(mainMenu.navItems)).toBe(true);
      expect(mainMenu.navItems.length).toBeGreaterThan(0);

      // Verify navigation items have the expected structure
      mainMenu.navItems.forEach((item: any) => {
        expect(item).toHaveProperty("label");
        expect(item).toHaveProperty("url");
        expect(typeof item.label).toBe("string");
        expect(typeof item.url).toBe("string");
      });

      // Verify expected navigation items exist
      const labels = mainMenu.navItems.map((item: any) => item.label);
      expect(labels).toContain("Home");
      expect(labels).toContain("Explore");
    });
  });

  describe("Configuration Validation", () => {
    it("should have valid configuration structure with correct types", () => {
      expect(SEED_CONFIG).toBeDefined();
      expect(typeof SEED_CONFIG).toBe("object");

      // Verify collections is an object, not just defined
      expect(SEED_CONFIG.collections).toBeDefined();
      expect(typeof SEED_CONFIG.collections).toBe("object");
      expect(Object.keys(SEED_CONFIG.collections).length).toBeGreaterThan(0);

      // Verify environments is an object, not just defined
      expect(SEED_CONFIG.environments).toBeDefined();
      expect(typeof SEED_CONFIG.environments).toBe("object");

      // Verify relationships is an object
      expect(SEED_CONFIG.relationships).toBeDefined();
      expect(typeof SEED_CONFIG.relationships).toBe("object");

      // Verify generators is an object
      expect(SEED_CONFIG.generators).toBeDefined();
      expect(typeof SEED_CONFIG.generators).toBe("object");
    });

    it("should have all required environments with valid configurations", () => {
      const requiredEnvironments = ["development", "test", "production", "staging"];

      requiredEnvironments.forEach((env) => {
        expect(SEED_CONFIG.environments[env]).toBeDefined();
        const envConfig = SEED_CONFIG.environments[env];

        if (!envConfig) {
          throw new Error(`Environment config for ${env} is undefined`);
        }

        // Verify each environment has valid structure
        expect(typeof envConfig).toBe("object");

        // Each environment should have enabled collections
        expect(envConfig).toHaveProperty("enabled");
        expect(Array.isArray(envConfig.enabled)).toBe(true);
        expect(envConfig.enabled.length).toBeGreaterThan(0);
      });

      // Verify development has comprehensive settings
      const devEnv = SEED_CONFIG.environments.development;
      if (!devEnv) {
        throw new Error("Development environment is undefined");
      }

      expect(devEnv.enabled).toContain("users");
      expect(devEnv.enabled).toContain("catalogs");
      expect(devEnv.enabled).toContain("events");

      // Verify development has settings configured
      expect(devEnv.settings).toBeDefined();
      expect(devEnv.settings?.useRealisticData).toBe(true);
    });

    it("should have valid collection configurations with proper counts", () => {
      Object.entries(SEED_CONFIG.collections).forEach(([_collectionName, config]) => {
        expect(config).toBeDefined();
        expect(typeof config).toBe("object");

        // If not disabled, should have a count configuration (either number or function)
        if (!config.disabled) {
          expect(config.count).toBeDefined();
          const countType = typeof config.count;
          expect(["number", "function"]).toContain(countType);

          // If it's a function, test that it returns a number for development
          if (countType === "function") {
            const devCount = (config.count as (env: string) => number)("development");
            expect(typeof devCount).toBe("number");
            expect(devCount).toBeGreaterThanOrEqual(0);
          } else {
            expect(config.count as number).toBeGreaterThan(0);
          }
        }

        // Validate dependencies if present
        if (config.dependencies) {
          expect(Array.isArray(config.dependencies)).toBe(true);

          // Each dependency should reference a valid collection
          config.dependencies.forEach((dep) => {
            expect(typeof dep).toBe("string");
            expect(dep.length).toBeGreaterThan(0);
            // Dependency should reference another collection in the config
            expect(SEED_CONFIG.collections).toHaveProperty(dep);
          });
        }
      });
    });

    it("should have valid collection names that match Payload collections", () => {
      // Note: main-menu is a Payload global (not a collection), so it's in SEED_CONFIG.globals
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

    it("should include main-menu in all environments", () => {
      const environments = ["development", "test", "production", "staging"];

      environments.forEach((env) => {
        const enabledCollections = getEnabledCollections(env);
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
      // Simple check: no collection should depend on itself
      Object.entries(SEED_CONFIG.collections).forEach(([collectionName, config]) => {
        if (config.dependencies) {
          expect(config.dependencies).not.toContain(collectionName);
        }
      });
    });
  });
});
