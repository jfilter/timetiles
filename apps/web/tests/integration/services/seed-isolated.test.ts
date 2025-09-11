/**
 * @module
 */
import { catalogSeeds } from "../../../lib/seed/seeds/catalogs";
import { datasetSeeds } from "../../../lib/seed/seeds/datasets";
import { eventSeeds } from "../../../lib/seed/seeds/events";
// importSeeds removed - import jobs are created dynamically, not seeded
import { userSeeds } from "../../../lib/seed/seeds/users";
import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";

describe.sequential("Isolated Seed System", () => {
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
    // Clean up before each test - this is now isolated per test file
    await testEnv.seedManager.truncate();
  });

  describe.sequential("SeedManager", () => {
    it("should initialize properly", () => {
      expect(testEnv.seedManager).toBeDefined();
      expect(testEnv.payload).toBeDefined();
    });

    it("should create seed manager instance", () => {
      expect(testEnv.seedManager.constructor.name).toBe("SeedManager");
    });
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
      expect(devDatasets.every((dataset) => dataset.name)).toBe(true);
      expect(prodDatasets.every((dataset) => dataset.name)).toBe(true);
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
    it("should seed users collection", async () => {
      await testEnv.seedManager.seed({
        collections: ["users"],
        environment: "development",
        truncate: false,
      });

      const users = await testEnv.payload.find({
        collection: "users",
        limit: 100,
      });

      expect(users.docs.length).toBeGreaterThan(0);
      expect(users.docs.some((user: any) => user.email === "admin@example.com")).toBe(true);
    });

    it("should seed catalogs collection", async () => {
      await testEnv.seedManager.seed({
        collections: ["catalogs"],
        environment: "development",
        truncate: false,
      });

      const catalogs = await testEnv.payload.find({
        collection: "catalogs",
        limit: 100,
      });

      expect(catalogs.docs.length).toBeGreaterThan(0);
      expect(catalogs.docs.some((catalog: any) => catalog.name === "Environmental Data")).toBe(true);
    });

    it("should seed datasets with proper catalog relationships", async () => {
      // First seed catalogs
      await testEnv.seedManager.seed({
        collections: ["catalogs"],
        environment: "development",
        truncate: false,
      });

      // Then seed datasets
      await testEnv.seedManager.seed({
        collections: ["datasets"],
        environment: "development",
        truncate: false,
      });

      const datasets = await testEnv.payload.find({
        collection: "datasets",
        limit: 100,
        depth: 1,
      });

      expect(datasets.docs.length).toBeGreaterThan(0);
      // Look for a dataset that should exist in development environment
      const airQualityDataset = datasets.docs.find((dataset: any) => dataset.name === "Air Quality Measurements");
      expect(airQualityDataset).toBeDefined();
      expect(airQualityDataset.catalog).toBeDefined();
      expect(typeof airQualityDataset.catalog).toBe("object"); // Should be populated
    });

    it("should seed events with proper dataset relationships", async () => {
      // Seed prerequisites
      await testEnv.seedManager.seed({
        collections: ["catalogs", "datasets"],
        environment: "development",
        truncate: false,
      });

      // Then seed events
      await testEnv.seedManager.seed({
        collections: ["events"],
        environment: "development",
        truncate: false,
      });

      const events = await testEnv.payload.find({
        collection: "events",
        limit: 100,
        depth: 1,
      });

      expect(events.docs.length).toBeGreaterThan(0);
      const anyEvent = events.docs.find((event: any) => event.data && typeof event.data === "object");
      expect(anyEvent).toBeDefined();
      expect(anyEvent.dataset).toBeDefined();
      expect(typeof anyEvent.dataset).toBe("object"); // Should be populated
    }, 60000); // 60 second timeout for seeding events with relationships

    it("should seed import-files with proper catalog relationships", async () => {
      // First seed catalogs
      await testEnv.seedManager.seed({
        collections: ["catalogs"],
        environment: "development",
        truncate: false,
      });

      // Then seed import files
      await testEnv.seedManager.seed({
        collections: ["import-files"],
        environment: "development",
        truncate: false,
      });

      const importFiles = await testEnv.payload.find({
        collection: "import-files",
        limit: 100,
        depth: 1,
      });

      expect(importFiles.docs.length).toBeGreaterThan(0);
      const airQualityImport = importFiles.docs.find(
        (imp: any) => imp.originalName === "Air Quality Monitoring - January 2024.csv"
      );
      expect(airQualityImport).toBeDefined();
      expect(airQualityImport.catalog).toBeDefined();
      expect(typeof airQualityImport.catalog).toBe("object"); // Should be populated
    });

    it("should seed all collections in correct order", async () => {
      await testEnv.seedManager.seed({
        environment: "development",
        truncate: false,
      });

      // Check that all collections have data
      const collections = ["users", "catalogs", "datasets", "events"];

      for (const collection of collections) {
        const docs = await testEnv.payload.find({
          collection,
          limit: 1,
        });
        expect(docs.docs.length).toBeGreaterThan(0);
      }
    }, 60000); // 60 second timeout for seeding all collections
  });

  describe.sequential("Error Handling", () => {
    it("should handle missing relationships gracefully", async () => {
      // Try to seed datasets without catalogs - should complete without throwing
      await expect(
        testEnv.seedManager.seed({
          collections: ["datasets"],
          environment: "development",
          truncate: false,
        })
      ).resolves.toBeUndefined();

      // Verify no datasets were actually created due to missing catalogs
      const datasetCount = await testEnv.seedManager.getCollectionCount("datasets");
      expect(datasetCount).toBe(0);
    });

    it("should handle missing datasets for events", async () => {
      await testEnv.seedManager.seed({
        collections: ["catalogs"],
        environment: "development",
        truncate: false,
      });

      // Try to seed events without datasets - should complete without throwing
      await expect(
        testEnv.seedManager.seed({
          collections: ["events"],
          environment: "development",
          truncate: false,
        })
      ).resolves.toBeUndefined();

      // Verify no events were actually created due to missing datasets
      const eventCount = await testEnv.seedManager.getCollectionCount("events");
      expect(eventCount).toBe(0);
    });

    it("should handle invalid collection names", async () => {
      // Invalid collection names should still complete without throwing
      await expect(
        testEnv.seedManager.seed({
          collections: ["invalid-collection"],
          environment: "development",
          truncate: false,
        })
      ).resolves.toBeUndefined(); // The method completes but logs the error
    }, 15000); // Add timeout to prevent hanging
  });
});
