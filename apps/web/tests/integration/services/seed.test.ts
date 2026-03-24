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
  const seedCollections = ["users", "catalogs", "datasets", "dataset-schemas", "events", "pages"];

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
        exitOnFailure: false,
      });

      // Check that collections have data (except ingest-files which we're skipping)
      const collections = ["users", "catalogs", "datasets", "events"];

      for (const collection of collections) {
        const result = await payload.find({ collection: collection as keyof Config["collections"], limit: 1 });

        expect(result.docs.length).toBeGreaterThan(0);
      }
    }, 90000); // 90 second timeout for seeding all collections (increases when running full suite)

    it("should handle specific collection seeding", async () => {
      // Explicitly truncate specific collections for better performance
      await testEnv.seedManager.truncate(["users", "catalogs", "datasets", "events"]);

      // Record dataset count before seeding to detect if seeding adds any
      const datasetsBefore = await testEnv.seedManager.getCollectionCount("datasets");

      await testEnv.seedManager.seedWithConfig({
        collections: ["users", "catalogs"],
        preset: "testing",
        exitOnFailure: false,
      });

      const users = await payload.find({ collection: "users", limit: 100 });

      const catalogs = await payload.find({ collection: "catalogs", limit: 100 });

      const datasetsAfter = await testEnv.seedManager.getCollectionCount("datasets");

      expect(users.docs.length).toBeGreaterThan(0);
      expect(catalogs.docs.length).toBeGreaterThan(0);
      // Seeding only users+catalogs should not create any new datasets
      expect(datasetsAfter).toBe(datasetsBefore);
    });
  });

  describe.sequential("Truncation Operations", () => {
    it("should truncate specified collections", async () => {
      // Seed a subset of collections that reliably succeed in test environments
      await testEnv.seedManager.seedWithConfig({
        preset: "testing",
        collections: ["users", "catalogs"],
        exitOnFailure: false,
      });

      // Capture a specific catalog ID before truncation
      const catalogsBefore = await payload.find({ collection: "catalogs", limit: 1 });
      expect(catalogsBefore.totalDocs).toBeGreaterThan(0);
      const catalogId = catalogsBefore.docs[0]!.id;

      // Truncate all seed collections (full list avoids FK constraint issues)
      await testEnv.seedManager.truncate(seedCollections);

      // Verify the specific catalog no longer exists
      const catalogAfter = await payload.find({ collection: "catalogs", where: { id: { equals: catalogId } } });
      expect(catalogAfter.totalDocs).toBe(0);
    }, 90000); // 90 second timeout (increases when running full suite)
  });

  describe.sequential("Error Handling", () => {
    it("should handle missing relationships gracefully", async () => {
      await testEnv.seedManager.truncate(seedCollections);

      // Record dataset count before seeding
      const datasetsBefore = await testEnv.seedManager.getCollectionCount("datasets");

      // Try to seed datasets without catalogs - should complete without throwing
      await expect(
        testEnv.seedManager.seedWithConfig({ collections: ["datasets"], preset: "testing", exitOnFailure: false })
      ).resolves.toBeUndefined();

      // Seeding datasets without catalogs should not create any new datasets
      const datasetsAfter = await testEnv.seedManager.getCollectionCount("datasets");
      expect(datasetsAfter).toBe(datasetsBefore);
    });

    it("should handle missing datasets for events", async () => {
      await testEnv.seedManager.truncate(seedCollections);
      await testEnv.seedManager.seedWithConfig({ collections: ["catalogs"], preset: "testing", exitOnFailure: false });

      const eventsBefore = await testEnv.seedManager.getCollectionCount("events");

      // Seeding events without datasets will fail (items cannot be created),
      // but it should not crash the process — just report failures
      try {
        await testEnv.seedManager.seedWithConfig({ collections: ["events"], preset: "testing", exitOnFailure: false });
      } catch {
        // Expected: seeding throws when all event items fail due to missing datasets
      }

      // Verify no events were actually created due to missing datasets
      const eventsAfter = await testEnv.seedManager.getCollectionCount("events");
      expect(eventsAfter).toBe(eventsBefore);
    });
  });

  describe.sequential("Configuration-Driven Seeding", () => {
    it("should seed using configuration for development preset", async () => {
      await testEnv.seedManager.seedWithConfig({
        preset: "development",
        collections: ["users", "catalogs", "datasets"],
        exitOnFailure: false,
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

      // In shared test environments (isolate: false), system users and leftover
      // users from prior tests may inflate the count beyond the seed config value
      expect(usersCount).toBeGreaterThanOrEqual(expectedUsersCount);
    });

    it("should seed using configuration for test preset", async () => {
      await testEnv.seedManager.seedWithConfig({
        preset: "testing",
        collections: ["users", "catalogs"],
        exitOnFailure: false,
      });

      const usersCount = await testEnv.seedManager.getCollectionCount("users");
      const catalogsCount = await testEnv.seedManager.getCollectionCount("catalogs");

      expect(usersCount).toBeGreaterThan(0);
      expect(catalogsCount).toBeGreaterThan(0);

      const testUsersConfig = getCollectionConfig("users", "testing");
      const expectedUsersCount =
        typeof testUsersConfig?.count === "function" ? testUsersConfig.count("testing") : (testUsersConfig?.count ?? 0);

      // Users may exceed expectedUsersCount due to system users (admin, test helpers)
      // and leftover users from prior tests in the shared test database
      expect(usersCount).toBeGreaterThanOrEqual(expectedUsersCount);
    });

    it("should respect collection dependencies", async () => {
      await testEnv.seedManager.seedWithConfig({
        preset: "development",
        collections: ["catalogs", "datasets"],
        exitOnFailure: false,
      });

      const catalogsCount = await testEnv.seedManager.getCollectionCount("catalogs");
      const datasetsCount = await testEnv.seedManager.getCollectionCount("datasets");

      expect(catalogsCount).toBeGreaterThan(0);
      expect(datasetsCount).toBeGreaterThan(0);

      const datasets = await testEnv.payload.find({ collection: "datasets", limit: 5, depth: 1 });

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
        configOverrides: { users: { count: 10, options: { includeTestUsers: true } } },
        exitOnFailure: false,
      });

      const usersCount = await testEnv.seedManager.getCollectionCount("users");
      // Seeded at least the override count (10), may include system users and
      // leftover users from prior tests in the shared test database
      expect(usersCount).toBeGreaterThanOrEqual(10);
    });

    it("should skip disabled collections", async () => {
      await testEnv.seedManager.seedWithConfig({ preset: "development", collections: ["media"], exitOnFailure: false });

      const mediaCount = await testEnv.seedManager.getCollectionCount("media");
      expect(mediaCount).toBe(0);
    });

    it("should throw error for unknown preset", async () => {
      await expect(
        testEnv.seedManager.seedWithConfig({ preset: "unknown-preset", collections: ["events"] })
      ).rejects.toThrow("Unknown preset: unknown-preset");
    });

    it("should seed main-menu global successfully", async () => {
      await testEnv.seedManager.seedWithConfig({
        preset: "development",
        collections: ["main-menu"],
        exitOnFailure: false,
      });

      // Query with German locale to verify localized content was seeded
      const mainMenu = await testEnv.payload.findGlobal({ slug: "main-menu", locale: "de" });

      expect(mainMenu).toBeDefined();
      expect(mainMenu.navItems).toBeDefined();
      expect(Array.isArray(mainMenu.navItems)).toBe(true);
      expect(mainMenu.navItems!.length).toBeGreaterThan(0);

      mainMenu.navItems!.forEach((item: any) => {
        expect(item).toHaveProperty("label");
        expect(item).toHaveProperty("url");
        expect(typeof item.label).toBe("string");
        expect(typeof item.url).toBe("string");
      });

      const labels = mainMenu.navItems!.map((item: any) => item.label);
      expect(labels).toContain("Startseite");
      expect(labels).toContain("Erkunden");
    });
  });
});
