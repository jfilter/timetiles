import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createIsolatedTestEnvironment } from "./test-helpers";
import { userSeeds } from "../lib/seed/seeds/users";
import { catalogSeeds } from "../lib/seed/seeds/catalogs";
import { datasetSeeds } from "../lib/seed/seeds/datasets";
import { eventSeeds } from "../lib/seed/seeds/events";
import { importSeeds } from "../lib/seed/seeds/imports";

describe("Isolated Seed System", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    // Clean up before each test - this is now isolated per test file
    await testEnv.seedManager.truncate();
  });

  describe("SeedManager", () => {
    it("should initialize properly", async () => {
      expect(testEnv.seedManager).toBeDefined();
      expect(testEnv.payload).toBeDefined();
    });

    it("should create seed manager instance", () => {
      expect(testEnv.seedManager.constructor.name).toBe("SeedManager");
    });
  });

  describe("Seed Data Functions", () => {
    it("should generate user seeds for different environments", () => {
      const devUsers = userSeeds("development");
      const testUsers = userSeeds("test");
      const prodUsers = userSeeds("production");

      expect(devUsers.length).toBeGreaterThan(testUsers.length);
      expect(testUsers.length).toBeGreaterThan(prodUsers.length);
      expect(devUsers.every((user) => user.email && user.password)).toBe(true);
    });

    it("should generate catalog seeds for different environments", () => {
      const devCatalogs = catalogSeeds("development");
      const testCatalogs = catalogSeeds("test");
      const prodCatalogs = catalogSeeds("production");

      expect(devCatalogs.length).toBeGreaterThan(testCatalogs.length);
      expect(testCatalogs.length).toBeGreaterThan(prodCatalogs.length);
      expect(devCatalogs.every((catalog) => catalog.name && catalog.slug)).toBe(
        true,
      );
    });

    it("should generate dataset seeds for different environments", () => {
      const devDatasets = datasetSeeds("development");
      const testDatasets = datasetSeeds("test");
      const prodDatasets = datasetSeeds("production");

      expect(devDatasets.length).toBeGreaterThan(testDatasets.length);
      expect(testDatasets.length).toBeGreaterThan(prodDatasets.length);
      expect(
        devDatasets.every((dataset) => dataset.name && dataset.schema),
      ).toBe(true);
    });

    it("should generate event seeds for different environments", () => {
      const devEvents = eventSeeds("development");
      const testEvents = eventSeeds("test");
      const prodEvents = eventSeeds("production");

      expect(devEvents.length).toBeGreaterThan(prodEvents.length);
      expect(prodEvents.length).toBeGreaterThan(testEvents.length);
      expect(devEvents.every((event) => event.dataset && event.data)).toBe(
        true,
      );
    });

    it("should generate import seeds for different environments", () => {
      const devImports = importSeeds("development");
      const testImports = importSeeds("test");
      const prodImports = importSeeds("production");

      expect(devImports.length).toBeGreaterThan(testImports.length);
      expect(testImports.length).toBeGreaterThan(prodImports.length);
      expect(devImports.every((imp) => imp.fileName && imp.catalog)).toBe(true);
    });
  });

  describe("Seeding Operations", () => {
    it("should seed users collection", async () => {
      await testEnv.seedManager.seed({
        collections: ["users"],
        environment: "test",
        truncate: false,
      });

      const users = await testEnv.payload.find({
        collection: "users",
        limit: 100,
      });

      expect(users.docs.length).toBeGreaterThan(0);
      expect(
        users.docs.some((user: any) => user.email === "admin@example.com"),
      ).toBe(true);
    });

    it("should seed catalogs collection", async () => {
      await testEnv.seedManager.seed({
        collections: ["catalogs"],
        environment: "test",
        truncate: false,
      });

      const catalogs = await testEnv.payload.find({
        collection: "catalogs",
        limit: 100,
      });

      expect(catalogs.docs.length).toBeGreaterThan(0);
      expect(
        catalogs.docs.some((catalog: any) => catalog.slug === "test-catalog"),
      ).toBe(true);
    });

    it("should seed datasets with proper catalog relationships", async () => {
      // First seed catalogs
      await testEnv.seedManager.seed({
        collections: ["catalogs"],
        environment: "test",
        truncate: false,
      });

      // Then seed datasets
      await testEnv.seedManager.seed({
        collections: ["datasets"],
        environment: "test",
        truncate: false,
      });

      const datasets = await testEnv.payload.find({
        collection: "datasets",
        limit: 100,
        depth: 1,
      });

      expect(datasets.docs.length).toBeGreaterThan(0);
      const testDataset = datasets.docs.find(
        (dataset: any) => dataset.slug === "test-dataset",
      );
      expect(testDataset).toBeDefined();
      expect(testDataset.catalog).toBeDefined();
      expect(typeof testDataset.catalog).toBe("object"); // Should be populated
    });

    it("should seed events with proper dataset relationships", async () => {
      // Seed prerequisites
      await testEnv.seedManager.seed({
        collections: ["catalogs", "datasets"],
        environment: "test",
        truncate: false,
      });

      // Then seed events
      await testEnv.seedManager.seed({
        collections: ["events"],
        environment: "test",
        truncate: false,
      });

      const events = await testEnv.payload.find({
        collection: "events",
        limit: 100,
        depth: 1,
      });

      expect(events.docs.length).toBeGreaterThan(0);
      const testEvent = events.docs.find(
        (event: any) => event.data.id === "test-001",
      );
      expect(testEvent).toBeDefined();
      expect(testEvent.dataset).toBeDefined();
      expect(typeof testEvent.dataset).toBe("object"); // Should be populated
    });

    it("should seed imports with proper catalog relationships", async () => {
      // First seed catalogs
      await testEnv.seedManager.seed({
        collections: ["catalogs"],
        environment: "test",
        truncate: false,
      });

      // Then seed imports
      await testEnv.seedManager.seed({
        collections: ["imports"],
        environment: "test",
        truncate: false,
      });

      const imports = await testEnv.payload.find({
        collection: "imports",
        limit: 100,
        depth: 1,
      });

      expect(imports.docs.length).toBeGreaterThan(0);
      const testImport = imports.docs.find(
        (imp: any) => imp.fileName === "test_data.csv",
      );
      expect(testImport).toBeDefined();
      expect(testImport.catalog).toBeDefined();
      expect(typeof testImport.catalog).toBe("object"); // Should be populated
    });

    it("should seed all collections in correct order", async () => {
      await testEnv.seedManager.seed({
        environment: "test",
        truncate: false,
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
        const docs = await testEnv.payload.find({
          collection,
          limit: 1,
        });
        expect(docs.docs.length).toBeGreaterThan(0);
      }
    });
  });

  describe("Error Handling", () => {
    it("should handle missing relationships gracefully", async () => {
      // Try to seed datasets without catalogs - should complete without throwing
      await expect(
        testEnv.seedManager.seed({
          collections: ["datasets"],
          environment: "test",
          truncate: false,
        }),
      ).resolves.toBeUndefined();

      // Verify no datasets were actually created due to missing catalogs
      const datasetCount = await testEnv.seedManager.getCollectionCount("datasets");
      expect(datasetCount).toBe(0);
    });

    it("should handle missing datasets for events", async () => {
      await testEnv.seedManager.seed({
        collections: ["catalogs"],
        environment: "test",
        truncate: false,
      });

      // Try to seed events without datasets - should complete without throwing
      await expect(
        testEnv.seedManager.seed({
          collections: ["events"],
          environment: "test",
          truncate: false,
        }),
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
          environment: "test",
          truncate: false,
        }),
      ).resolves.toBeUndefined(); // The method completes but logs the error
    });
  });
});
