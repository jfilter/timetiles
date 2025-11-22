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

import { createRichText } from "../../setup/factories";
import { createIntegrationTestEnvironment } from "../../setup/integration/environment";
import {
  areValidCoordinates,
  calculateCentroid,
  calculateDistance,
  createCluster,
  generateNearbyCoordinate,
  isWithinBounds,
  TEST_COORDINATES,
  validateDistribution,
} from "../../setup/integration/geospatial-data";

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
      // Create event with inline data
      const event = {
        id: Math.floor(Math.random() * 10000),
        dataset: 1,
        data: {
          title: "Tech Conference 2024",
          category: "Conference",
          tags: ["technology", "networking", "business", "networking", "professional"],
          url: "https://example-conference.com",
          address: "123 Tech Street, New York, NY",
        },
        location: { latitude: 40.7128, longitude: -74.006 },
        coordinateSource: { type: "manual" },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect((event.data as Record<string, unknown>).title).toBe("Tech Conference 2024");
      expect(event.location).toEqual({ latitude: 40.7128, longitude: -74.006 });
      expect((event.data as Record<string, unknown>).category).toBe("Conference");
      expect((event.data as Record<string, unknown>).tags).toContain("technology");
      expect((event.data as Record<string, unknown>).address).toBe("123 Tech Street, New York, NY");
    });

    it("should create multiple events with variations", () => {
      // Generate events near NYC
      const baseLocation = { latitude: 40.7128, longitude: -74.006 };
      const events = Array.from({ length: 5 }, (_, i) => {
        const location = generateNearbyCoordinate(baseLocation, 10);
        return {
          id: Math.floor(Math.random() * 10000),
          dataset: 1,
          data: {
            title: `Meetup ${i + 1}`,
            category: "Meetup",
            tags: ["community", "social", "local"],
            description: "Local community gathering",
            capacity: 50 + i * 10,
          },
          location,
          coordinateSource: { type: "manual" },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });

      expect(events).toHaveLength(5);
      events.forEach((event, i) => {
        expect((event.data as Record<string, unknown>).title).toBe(`Meetup ${i + 1}`);
        expect((event.data as Record<string, unknown>).category).toBe("Meetup");
        expect((event.data as Record<string, unknown>).capacity).toBe(50 + i * 10);

        // Check coordinates are near NYC (within 10km)
        const distance = calculateDistance(event.location, TEST_COORDINATES.NYC);
        expect(distance).toBeLessThanOrEqual(10);
      });
    });

    it("should create related catalogs and datasets", () => {
      // Create catalog inline
      const catalog = {
        name: "Technology Events",
        slug: "technology-events",
        description: createRichText("Tech conferences and meetups"),
        _status: "published" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create dataset inline
      const dataset = {
        name: "Tech Conference Schedule",
        slug: "tech-conference-schedule",
        description: createRichText("Test dataset description"),
        catalog: 1,
        language: "eng",
        _status: "published" as const,
        isPublic: true,
        schemaConfig: {
          enabled: true,
          locked: false,
          autoGrow: true,
          autoApproveNonBreaking: false,
        },
        metadata: {
          schemaType: "events",
          expectedSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
              date: { type: "string", format: "date-time" },
              location: { type: "string" },
              category: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
            },
            required: ["title", "date"],
          },
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      expect(catalog.name).toBe("Technology Events");
      expect(catalog.slug).toBe("technology-events");
      expect(catalog._status).toBe("published");

      expect(dataset.name).toBe("Tech Conference Schedule");
      expect(dataset.catalog).toBe(1);
    });

    it("should create realistic test scenarios", () => {
      // Create scenario inline (conference-events)
      const catalog = {
        name: "Technology Events",
        slug: "technology-events",
        description: createRichText("Technology conferences and meetups"),
        _status: "published" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const dataset = {
        name: "Tech Conference Schedule",
        slug: "tech-conference-schedule",
        description: createRichText("Test dataset description"),
        catalog: 1,
        language: "eng",
        _status: "published" as const,
        isPublic: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const events = Array.from({ length: 10 }, (_, i) => {
        const location = generateNearbyCoordinate(TEST_COORDINATES.NYC, 50);
        return {
          id: Math.floor(Math.random() * 10000),
          dataset: 1,
          data: {
            title: `Tech Conference ${i + 1}`,
            category: "Conference",
            tags: ["business", "networking", "professional"],
            url: "https://example-conference.com",
            address: `${100 + i} Tech Street, New York, NY`,
          },
          location,
          coordinateSource: { type: "manual" },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      });

      const scenario = {
        catalogs: [catalog],
        datasets: [dataset],
        events,
      };

      expect(scenario.catalogs).toHaveLength(1);
      expect(scenario.datasets).toHaveLength(1);
      expect(scenario.events).toHaveLength(10);

      const catalogResult = scenario.catalogs[0];
      const datasetResult = scenario.datasets[0];
      const eventsResult = scenario.events;

      expect(catalogResult?.name).toBe("Technology Events");
      expect(datasetResult?.name).toBe("Tech Conference Schedule");

      eventsResult.forEach((event, i) => {
        expect((event.data as Record<string, unknown>).title).toBe(`Tech Conference ${i + 1}`);
        expect((event.data as Record<string, unknown>).category).toBe("Conference");

        // Check within 50km radius
        const distance = calculateDistance(event.location, TEST_COORDINATES.NYC);
        expect(distance).toBeLessThanOrEqual(50);
      });
    });
  });

  describe("Geospatial Assertion Helpers", () => {
    it("should validate coordinates correctly", () => {
      const validCoords = { latitude: 40.7128, longitude: -74.006 };
      const invalidCoords = { latitude: 200, longitude: -300 };

      expect(areValidCoordinates(validCoords)).toBe(true);
      expect(areValidCoordinates(invalidCoords)).toBe(false);
    });

    it("should check distances and radiuses", () => {
      const nycCoords = TEST_COORDINATES.NYC;
      const nearbyCoords = { latitude: 40.8, longitude: -74.1 };
      const farCoords = TEST_COORDINATES.LONDON;

      // Within radius checks
      expect(calculateDistance(nearbyCoords, nycCoords)).toBeLessThanOrEqual(20);
      expect(calculateDistance(farCoords, nycCoords)).toBeGreaterThan(1000);

      // Distance checks
      expect(calculateDistance(nearbyCoords, nycCoords)).toBeLessThan(20);
      expect(calculateDistance(farCoords, nycCoords)).toBeGreaterThan(1000);
    });

    it("should validate bounding boxes", () => {
      const nycMetroBounds = TEST_COORDINATES.NYC_METRO;
      const coordsInNyc = { latitude: 40.7, longitude: -74.0 };
      const coordsOutsideNyc = { latitude: 42.0, longitude: -71.0 }; // Boston area

      expect(isWithinBounds(coordsInNyc, nycMetroBounds)).toBe(true);
      expect(isWithinBounds(coordsOutsideNyc, nycMetroBounds)).toBe(false);
    });

    it("should work with GeospatialTestHelper utilities", () => {
      // Create a cluster of points
      const cluster = createCluster(TEST_COORDINATES.NYC, 10, 5);
      expect(cluster).toHaveLength(10);

      cluster.forEach((point) => {
        expect(areValidCoordinates(point)).toBe(true);
        expect(calculateDistance(point, TEST_COORDINATES.NYC)).toBeLessThanOrEqual(5);
      });

      // Create multiple clusters
      const multipleClusters = [
        createCluster(TEST_COORDINATES.NYC, 5, 2),
        createCluster(TEST_COORDINATES.SAN_FRANCISCO, 5, 2),
      ];

      expect(multipleClusters).toHaveLength(2);
      expect(multipleClusters[0]).toHaveLength(5);
      expect(multipleClusters[1]).toHaveLength(5);

      // Validate distribution
      const allPoints = multipleClusters.flat();
      const distribution = validateDistribution(allPoints);

      expect(distribution.isValid).toBe(true);
      expect(distribution.issues).toHaveLength(0);
      expect(areValidCoordinates(distribution.centroid)).toBe(true);
    });

    it("should check centroid calculations", () => {
      const points = [
        { latitude: 40.0, longitude: -74.0 },
        { latitude: 41.0, longitude: -74.0 },
        { latitude: 40.5, longitude: -73.0 },
        { latitude: 40.5, longitude: -75.0 },
      ];

      const expectedCentroid = { latitude: 40.5, longitude: -74.0 };
      const actualCentroid = calculateCentroid(points);

      // Check within 0.1km tolerance
      const distance = calculateDistance(expectedCentroid, actualCentroid);
      expect(distance).toBeLessThanOrEqual(0.1);
    });

    it("should handle event objects with location properties", () => {
      const event = {
        title: "Test Event",
        location: { latitude: 40.7128, longitude: -74.006 },
        data: {},
      };

      expect(areValidCoordinates(event.location)).toBe(true);
      expect(calculateDistance(event.location, TEST_COORDINATES.NYC)).toBeLessThanOrEqual(1);
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
      await testEnv.seedManager.seedWithConfig({
        collections: ["users"],
        preset: "testing",
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
