/**
 * Enhanced Testing Infrastructure Integration Test.
 *
 * Tests all the testing infrastructure improvements:
 * - TestEnvironmentBuilder
 * - Enhanced test utilities with builder patterns
 * - Geospatial assertion helpers
 * - Efficient database operations.
 *
 * @module
 * @category Integration Tests
 */

// Import geospatial assertions (they extend expect automatically) and helper utilities
import { createIntegrationTestEnvironment } from "../../setup/test-environment-builder";
import { GeospatialTestHelper, TEST_COORDINATES } from "../../utils/geospatial-assertions";
import { TestDataBuilder } from "../../utils/test-data-builder";

describe("Enhanced Testing Infrastructure", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  describe("Test Environment", () => {
    it("should provide isolated test environment with functional Payload instance", async () => {
      // Verify Payload instance can perform actual database operations
      expect(testEnv.payload).toBeDefined();

      // Test that Payload can query collections
      const result = await testEnv.payload.find({ collection: "users", limit: 1 });
      expect(result).toHaveProperty("docs");
      expect(result).toHaveProperty("totalDocs");
      expect(typeof result.totalDocs).toBe("number");
      expect(Array.isArray(result.docs)).toBe(true);
    });

    it("should provide functional SeedManager that can manipulate data", async () => {
      expect(testEnv.seedManager).toBeDefined();

      // Verify SeedManager can actually truncate collections
      // Use a collection that doesn't auto-create entries
      await testEnv.payload.create({
        collection: "catalogs",
        data: {
          name: "Test Catalog",
          slug: "test-catalog",
          _status: "published",
        },
      });

      const beforeResult = await testEnv.payload.find({ collection: "catalogs", limit: 100 });
      expect(beforeResult.totalDocs).toBeGreaterThan(0);

      // Test truncation actually removes data
      await testEnv.seedManager.truncate(["catalogs"]);

      const afterResult = await testEnv.payload.find({ collection: "catalogs", limit: 1 });
      expect(afterResult.totalDocs).toBe(0);
    });

    it("should provide valid temporary directory that exists", async () => {
      expect(testEnv.tempDir).toBeDefined();
      expect(typeof testEnv.tempDir).toBe("string");

      if (!testEnv.tempDir) {
        throw new Error("tempDir is undefined");
      }

      expect(testEnv.tempDir.length).toBeGreaterThan(0);

      // Verify temp directory actually exists on filesystem
      const fs = await import("fs/promises");
      const stats = await fs.stat(testEnv.tempDir);
      expect(stats.isDirectory()).toBe(true);
    });

    it("should provide functional cleanup callback", () => {
      expect(testEnv.cleanup).toBeDefined();
      expect(typeof testEnv.cleanup).toBe("function");

      // Cleanup will be called in afterAll, we just verify it's callable
      expect(testEnv.cleanup).toBeInstanceOf(Function);
    });
  });

  describe("TestDataBuilder with Builder Patterns", () => {
    it("should create realistic events with fluent API", () => {
      const event = TestDataBuilder.events()
        .withTitle("Tech Conference 2024")
        .withCoordinates(40.7128, -74.006) // NYC
        .withDataset(1)
        .withRealisticData("conference")
        .withAddress("123 Tech Street, New York, NY")
        .withTags(["technology", "networking"])
        .build();

      expect((event.data as Record<string, unknown>).title).toBe("Tech Conference 2024");
      expect(event.location).toEqual({ latitude: 40.7128, longitude: -74.006 });
      expect((event.data as Record<string, unknown>).category).toBe("Conference");
      expect((event.data as Record<string, unknown>).tags).toContain("technology");
      expect((event.data as Record<string, unknown>).address).toBe("123 Tech Street, New York, NY");
    });

    it("should create multiple events with variations", () => {
      const events = TestDataBuilder.events()
        .withDataset(1)
        .withRealisticData("meetup")
        .nearLocation(40.7128, -74.006, 10) // Within 10km of NYC
        .buildMany(5, (event, i) => ({
          ...event,
          data: {
            ...(typeof event.data === "object" && event.data !== null && !Array.isArray(event.data) ? event.data : {}),
            title: `Meetup ${i + 1}`,
            capacity: 50 + i * 10,
          },
        }));

      expect(events).toHaveLength(5);
      events.forEach((event, i) => {
        expect((event.data as Record<string, unknown>).title).toBe(`Meetup ${i + 1}`);
        expect((event.data as Record<string, unknown>).category).toBe("Meetup");
        expect((event.data as Record<string, unknown>).capacity).toBe(50 + i * 10);

        // Check coordinates are near NYC (within 10km)
        expect(event.location).toBeWithinRadius(TEST_COORDINATES.NYC, 10);
      });
    });

    it("should create related catalogs and datasets", () => {
      const catalog = TestDataBuilder.catalogs()
        .withName("Technology Events")
        .withDescription("Tech conferences and meetups")
        .withStatus("published")
        .build();

      const dataset = TestDataBuilder.datasets()
        .withName("Tech Conference Schedule")
        .withCatalog(1)
        .withRealisticSchema("events")
        .build();

      expect(catalog.name).toBe("Technology Events");
      expect(catalog.slug).toBe("technology-events");
      expect(catalog._status).toBe("published");

      expect(dataset.name).toBe("Tech Conference Schedule");
      expect(dataset.catalog).toBe(1);
    });

    it("should create realistic test scenarios", () => {
      const scenario = TestDataBuilder.createScenario("conference-events");

      expect(scenario.catalogs).toHaveLength(1);
      expect(scenario.datasets).toHaveLength(1);
      expect(scenario.events).toHaveLength(10);

      const catalog = scenario.catalogs[0];
      const dataset = scenario.datasets[0];
      const events = scenario.events;

      expect(catalog?.name).toBe("Technology Events");
      expect(dataset?.name).toBe("Tech Conference Schedule");

      events.forEach((event, i) => {
        expect((event.data as Record<string, unknown>).title).toBe(`Tech Conference ${i + 1}`);
        expect((event.data as Record<string, unknown>).category).toBe("Conference");
        expect(event.location).toBeWithinRadius(TEST_COORDINATES.NYC, 50);
      });
    });
  });

  describe("Geospatial Assertion Helpers", () => {
    it("should validate coordinates correctly", () => {
      const validCoords = { latitude: 40.7128, longitude: -74.006 };
      const invalidCoords = { latitude: 200, longitude: -300 };

      expect(validCoords).toHaveValidCoordinates();
      expect(invalidCoords).not.toHaveValidCoordinates();
    });

    it("should check distances and radiuses", () => {
      const nycCoords = TEST_COORDINATES.NYC;
      const nearbyCoords = { latitude: 40.8, longitude: -74.1 };
      const farCoords = TEST_COORDINATES.LONDON;

      expect(nearbyCoords).toBeWithinRadius(nycCoords, 20);
      expect(farCoords).not.toBeWithinRadius(nycCoords, 1000);

      expect(nearbyCoords).toBeCloserThan(nycCoords, 20);
      expect(farCoords).toBeFurtherThan(nycCoords, 1000);
    });

    it("should validate bounding boxes", () => {
      const nycMetroBounds = TEST_COORDINATES.NYC_METRO;
      const coordsInNyc = { latitude: 40.7, longitude: -74.0 };
      const coordsOutsideNyc = { latitude: 42.0, longitude: -71.0 }; // Boston area

      expect(coordsInNyc).toBeWithinBounds(nycMetroBounds);
      expect(coordsOutsideNyc).not.toBeWithinBounds(nycMetroBounds);
    });

    it("should work with GeospatialTestHelper utilities", () => {
      // Create a cluster of points
      const cluster = GeospatialTestHelper.createCluster(TEST_COORDINATES.NYC, 10, 5);
      expect(cluster).toHaveLength(10);

      cluster.forEach((point) => {
        expect(point).toHaveValidCoordinates();
        expect(point).toBeWithinRadius(TEST_COORDINATES.NYC, 5);
      });

      // Create multiple clusters
      const multipleClusters = GeospatialTestHelper.createMultipleClusters(
        [TEST_COORDINATES.NYC, TEST_COORDINATES.SAN_FRANCISCO],
        5,
        2
      );

      expect(multipleClusters).toHaveLength(2);
      expect(multipleClusters[0]).toHaveLength(5);
      expect(multipleClusters[1]).toHaveLength(5);

      // Validate distribution
      const allPoints = multipleClusters.flat();
      const distribution = GeospatialTestHelper.validateDistribution(allPoints);

      expect(distribution.isValid).toBe(true);
      expect(distribution.issues).toHaveLength(0);
      expect(distribution.centroid).toHaveValidCoordinates();
    });

    it("should check centroid calculations", () => {
      const points = [
        { latitude: 40.0, longitude: -74.0 },
        { latitude: 41.0, longitude: -74.0 },
        { latitude: 40.5, longitude: -73.0 },
        { latitude: 40.5, longitude: -75.0 },
      ];

      const expectedCentroid = { latitude: 40.5, longitude: -74.0 };

      expect(expectedCentroid).toBeACentroidOf(points, 0.1);
    });

    it("should handle event objects with location properties", () => {
      const event = {
        title: "Test Event",
        location: { latitude: 40.7128, longitude: -74.006 },
        data: {},
      };

      expect(event).toHaveValidCoordinates();
      expect(event).toBeWithinRadius(TEST_COORDINATES.NYC, 1);
    });
  });

  describe("Enhanced Database Operations", () => {
    it("should query collections and return valid results", async () => {
      const result = await testEnv.payload.find({ collection: "users", limit: 1 });

      // Verify result structure is valid
      expect(result).toHaveProperty("docs");
      expect(result).toHaveProperty("totalDocs");
      expect(typeof result.totalDocs).toBe("number");
      expect(Array.isArray(result.docs)).toBe(true);
    });

    it("should truncate collections and verify data is removed", async () => {
      // Create some data first (use catalogs to avoid admin user auto-creation)
      await testEnv.payload.create({
        collection: "catalogs",
        data: {
          name: "Truncate Test Catalog 2",
          slug: "truncate-test-2",
          _status: "published",
        },
      });

      const beforeResult = await testEnv.payload.find({ collection: "catalogs", limit: 100 });
      expect(beforeResult.totalDocs).toBeGreaterThan(0);

      // Truncate and verify data was removed
      await testEnv.seedManager.truncate(["catalogs"]);

      const afterResult = await testEnv.payload.find({ collection: "catalogs", limit: 1 });
      expect(afterResult.totalDocs).toBe(0);
    });
  });

  describe("Integration Test Scenarios", () => {
    it("should seed collections with actual data", async () => {
      // Ensure clean state
      await testEnv.seedManager.truncate(["users"]);

      // Seed users collection
      await testEnv.seedManager.seed({
        collections: ["users"],
        environment: "test",
        truncate: true,
      });

      // Verify users were actually seeded (not just that it didn't throw)
      const result = await testEnv.payload.find({ collection: "users", limit: 100 });
      expect(typeof result.totalDocs).toBe("number");
      expect(result.totalDocs).toBeGreaterThan(0); // Should have seeded at least 1 user

      // Verify seeded data has expected structure
      expect(result.docs.length).toBeGreaterThan(0);
      const firstUser = result.docs[0];
      expect(firstUser).toHaveProperty("email");
      expect(firstUser).toHaveProperty("role");
    });
  });
});
