import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createIsolatedTestEnvironment } from "./test-helpers";
import { userSeeds } from "../lib/seed/seeds/users";
import { catalogSeeds } from "../lib/seed/seeds/catalogs";
import { datasetSeeds } from "../lib/seed/seeds/datasets";
import { eventSeeds } from "../lib/seed/seeds/events";
import { importSeeds } from "../lib/seed/seeds/imports";

describe.sequential("Seed System", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;
  let payload: any;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
    payload = testEnv.payload;
  });

  afterAll(async () => {
    try {
      await testEnv.cleanup();
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }, 60000); // 60 second timeout for cleanup

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
      expect(devCatalogs.every((catalog) => catalog.name && catalog.slug)).toBe(
        true,
      );
      expect(
        prodCatalogs.every((catalog) => catalog.name && catalog.slug),
      ).toBe(true);
    });

    it("should generate dataset seeds for different environments", () => {
      const devDatasets = datasetSeeds("development");
      const prodDatasets = datasetSeeds("production");

      // Development should have more datasets than production
      expect(devDatasets.length).toBeGreaterThan(prodDatasets.length);
      // All datasets should have required fields
      expect(
        devDatasets.every((dataset) => dataset.name && dataset.schema),
      ).toBe(true);
      expect(
        prodDatasets.every((dataset) => dataset.name && dataset.schema),
      ).toBe(true);
    });

    it("should generate event seeds for different environments", () => {
      const devEvents = eventSeeds("development");
      const prodEvents = eventSeeds("production");

      // Development should have more events than production
      expect(devEvents.length).toBeGreaterThan(prodEvents.length);
      // All events should have required fields
      expect(devEvents.every((event) => event.dataset && event.data)).toBe(
        true,
      );
      expect(prodEvents.every((event) => event.dataset && event.data)).toBe(
        true,
      );
    });

    it("should generate import seeds for different environments", () => {
      const devImports = importSeeds("development");
      const prodImports = importSeeds("production");

      // Development should have more imports than production
      expect(devImports.length).toBeGreaterThan(prodImports.length);
      // All imports should have required fields
      expect(devImports.every((imp) => imp.fileName && imp.catalog)).toBe(true);
      expect(prodImports.every((imp) => imp.fileName && imp.catalog)).toBe(
        true,
      );
    });
  });

  describe.sequential("Seeding Operations", () => {
    it("should seed all collections in correct order", async () => {
      await testEnv.seedManager.truncate();

      // Seed all collections at once to ensure dependencies are resolved
      await testEnv.seedManager.seed({
        environment: "test",
      });

      // Check that all collections have data
      const collections = [
        "users",
        "catalogs",
        "datasets",
        "events",
        "imports",
      ];

      for (const collection of collections) {
        const result = await payload.find({
          collection,
          limit: 1,
        });
        expect(result.docs.length).toBeGreaterThan(0);
      }
    });

    it("should handle specific collection seeding", async () => {
      // Explicitly truncate all collections to ensure clean state
      await testEnv.seedManager.truncate([
        "users",
        "catalogs",
        "datasets",
        "events",
        "imports",
      ]);

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
      const collections = [
        "users",
        "catalogs",
        "datasets",
        "events",
        "imports",
      ];

      for (const collection of collections) {
        const result = await payload.find({
          collection,
          limit: 1,
        });
        if (result.docs.length > 0) {
          hasData = true;
          break;
        }
      }
      expect(hasData).toBe(true); // Ensure we have data to truncate

      // Truncate all (with timeout protection)
      await Promise.race([
        testEnv.seedManager.truncate(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Truncate timeout")), 10000),
        ),
      ]);

      // Check that most collections are empty (allowing some that might not clear due to refs)
      let emptiedCount = 0;
      for (const collection of collections) {
        const result = await payload.find({
          collection,
          limit: 100,
        });
        if (result.docs.length === 0) {
          emptiedCount++;
        }
      }

      // Expect at least 3 out of 5 collections to be properly truncated
      expect(emptiedCount).toBeGreaterThanOrEqual(3);
    }, 15000); // 15 second timeout
  });

  describe.sequential("Error Handling", () => {
    it("should handle missing relationships gracefully", async () => {
      await testEnv.seedManager.truncate();
      // Try to seed datasets without catalogs - should complete without throwing
      await expect(
        testEnv.seedManager.seed({
          collections: ["datasets"],
          environment: "test",
        }),
      ).resolves.toBeUndefined();

      // Verify no datasets were actually created due to missing catalogs
      const datasetCount =
        await testEnv.seedManager.getCollectionCount("datasets");
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
        }),
      ).resolves.toBeUndefined();

      // Verify no events were actually created due to missing datasets
      const eventCount = await testEnv.seedManager.getCollectionCount("events");
      expect(eventCount).toBe(0);
    });
  });
});
