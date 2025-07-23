/**
 * Enhanced Testing Infrastructure Integration Test
 *
 * Tests all the testing infrastructure improvements:
 * - TestEnvironmentBuilder
 * - Enhanced test utilities with builder patterns
 * - Geospatial assertion helpers
 * - Efficient database operations
 */

import {
  TestEnvironmentBuilder,
  type TestEnvironment,
} from "../../setup/test-environment-builder";
import { TestDataBuilder } from "../../utils/test-data-builder";
import {
  GeospatialTestHelper,
  TEST_COORDINATES,
} from "../../utils/geospatial-assertions";

// Import geospatial assertions (they extend expect automatically)
import "../../utils/geospatial-assertions";

describe("Enhanced Testing Infrastructure", () => {
  let testEnv: TestEnvironment;
  let builder: TestEnvironmentBuilder;

  beforeAll(async () => {
    builder = new TestEnvironmentBuilder();
    testEnv = await builder.createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  describe("TestEnvironmentBuilder", () => {
    it("should create isolated test environments with different configurations", async () => {
      // Test unit test environment
      const unitEnv = await builder.createUnitTestEnvironment();
      expect(unitEnv.payload).toBeDefined();
      expect(unitEnv.seedManager).toBeDefined();
      expect(unitEnv.tempDir).toBeUndefined(); // Unit tests don't need temp dirs

      // Test integration environment
      const integrationEnv = await builder.createIntegrationTestEnvironment();
      expect(integrationEnv.payload).toBeDefined();
      expect(integrationEnv.seedManager).toBeDefined();
      expect(integrationEnv.tempDir).toBeDefined();

      // Test custom environment
      const customEnv = await builder.createTestEnvironment({
        collections: ["events", "catalogs"],
        seedData: false,
        isolationLevel: "test",
        createTempDir: true,
      });
      expect(customEnv.payload).toBeDefined();
      expect(customEnv.tempDir).toBeDefined();

      // Cleanup
      await Promise.all([
        unitEnv.cleanup(),
        integrationEnv.cleanup(),
        customEnv.cleanup(),
      ]);
    });

    it("should provide helper methods for common operations", async () => {
      // Test collection count
      const initialCount = await testEnv.getCollectionCount("users");
      expect(typeof initialCount).toBe("number");

      // Test truncation
      await testEnv.truncateCollections(["users"]);
      const afterTruncateCount = await testEnv.getCollectionCount("users");
      expect(afterTruncateCount).toBe(0);
    });
  });

  describe("TestDataBuilder with Builder Patterns", () => {
    it("should create realistic events with fluent API", async () => {
      const event = TestDataBuilder.events()
        .withTitle("Tech Conference 2024")
        .withCoordinates(40.7128, -74.006) // NYC
        .withDataset(1)
        .withRealisticData("conference")
        .withAddress("123 Tech Street, New York, NY")
        .withTags(["technology", "networking"])
        .build();

      expect((event.data as Record<string, unknown>).title).toBe(
        "Tech Conference 2024",
      );
      expect(event.location).toEqual({ latitude: 40.7128, longitude: -74.006 });
      expect((event.data as Record<string, unknown>).category).toBe(
        "Conference",
      );
      expect((event.data as Record<string, unknown>).tags).toContain(
        "technology",
      );
      expect((event.data as Record<string, unknown>).address).toBe(
        "123 Tech Street, New York, NY",
      );
    });

    it("should create multiple events with variations", async () => {
      const events = TestDataBuilder.events()
        .withDataset(1)
        .withRealisticData("meetup")
        .nearLocation(40.7128, -74.006, 10) // Within 10km of NYC
        .buildMany(5, (event, i) => ({
          ...event,
          data: {
            ...(typeof event.data === "object" &&
            event.data !== null &&
            !Array.isArray(event.data)
              ? event.data
              : {}),
            title: `Meetup ${i + 1}`,
            capacity: 50 + i * 10,
          },
        }));

      expect(events).toHaveLength(5);
      events.forEach((event, i) => {
        expect((event.data as Record<string, unknown>).title).toBe(
          `Meetup ${i + 1}`,
        );
        expect((event.data as Record<string, unknown>).category).toBe("Meetup");
        expect((event.data as Record<string, unknown>).capacity).toBe(
          50 + i * 10,
        );

        // Check coordinates are near NYC (within 10km)
        expect(event.location).toBeWithinRadius(TEST_COORDINATES.NYC, 10);
      });
    });

    it("should create related catalogs and datasets", async () => {
      const catalog = TestDataBuilder.catalogs()
        .withName("Technology Events")
        .withDescription("Tech conferences and meetups")
        .withStatus("active")
        .build();

      const dataset = TestDataBuilder.datasets()
        .withName("Tech Conference Schedule")
        .withCatalog(1)
        .withRealisticSchema("events")
        .build();

      expect(catalog.name).toBe("Technology Events");
      expect(catalog.slug).toBe("technology-events");
      expect(catalog.status).toBe("active");

      expect(dataset.name).toBe("Tech Conference Schedule");
      expect(dataset.catalog).toBe(1);
      expect(
        (dataset.schema as Record<string, unknown>)?.properties,
      ).toHaveProperty("title");
      expect(
        (dataset.schema as Record<string, unknown>)?.properties,
      ).toHaveProperty("date");
    });

    it("should create realistic test scenarios", async () => {
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
        expect((event.data as Record<string, unknown>).title).toBe(
          `Tech Conference ${i + 1}`,
        );
        expect((event.data as Record<string, unknown>).category).toBe(
          "Conference",
        );
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
      const cluster = GeospatialTestHelper.createCluster(
        TEST_COORDINATES.NYC,
        10,
        5,
      );
      expect(cluster).toHaveLength(10);

      cluster.forEach((point) => {
        expect(point).toHaveValidCoordinates();
        expect(point).toBeWithinRadius(TEST_COORDINATES.NYC, 5);
      });

      // Create multiple clusters
      const multipleClusters = GeospatialTestHelper.createMultipleClusters(
        [TEST_COORDINATES.NYC, TEST_COORDINATES.SAN_FRANCISCO],
        5,
        2,
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
    it("should handle collection counts", async () => {
      const count = await testEnv.getCollectionCount("users");
      expect(typeof count).toBe("number");
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it("should truncate collections without errors", async () => {
      // Test that truncation doesn't throw errors
      await expect(
        testEnv.truncateCollections(["users"]),
      ).resolves.not.toThrow();

      const afterCount = await testEnv.getCollectionCount("users");
      expect(afterCount).toBe(0);
    });
  });

  describe("Integration Test Scenarios", () => {
    it("should handle basic seeding operations", async () => {
      // Test that seeding doesn't throw errors (infrastructure test)
      await expect(
        testEnv.seedManager.seed({
          collections: ["users"],
          environment: "test",
          truncate: true,
        }),
      ).resolves.not.toThrow();

      // Test that we can get the count (infrastructure test)
      const userCount = await testEnv.getCollectionCount("users");
      expect(typeof userCount).toBe("number");
      expect(userCount).toBeGreaterThanOrEqual(0);
    });

    it("should provide test environment isolation", () => {
      // Test that test environment provides isolated setup
      expect(testEnv.payload).toBeDefined();
      expect(testEnv.seedManager).toBeDefined();
      expect(testEnv.cleanup).toBeDefined();
      expect(typeof testEnv.getCollectionCount).toBe("function");
      expect(typeof testEnv.truncateCollections).toBe("function");
    });
  });
});
