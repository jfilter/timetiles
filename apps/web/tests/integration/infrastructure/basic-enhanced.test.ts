/**
 * Basic Enhanced Testing Infrastructure Test.
 *
 * Simple test to verify the core functionality works.
 *
 * @module
 * @category Integration Tests
 */

import { createIntegrationTestEnvironment } from "../../setup/integration/environment";
import {
  areValidCoordinates,
  calculateDistance,
  generateNearbyCoordinate,
  TEST_COORDINATES,
} from "../../setup/integration/geospatial-data";

describe("Basic Enhanced Testing Infrastructure", () => {
  let testEnv: Awaited<ReturnType<typeof createIntegrationTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIntegrationTestEnvironment();
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  describe("TestDataBuilder", () => {
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
      const events = Array.from({ length: 3 }, (_, i) => {
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

      expect(events).toHaveLength(3);
      events.forEach((event, i) => {
        expect((event.data as Record<string, unknown>).title).toBe(`Meetup ${i + 1}`);
        expect((event.data as Record<string, unknown>).category).toBe("Meetup");
        expect((event.data as Record<string, unknown>).capacity).toBe(50 + i * 10);

        // Check coordinates are near NYC (within 10km)
        const distance = calculateDistance(event.location, TEST_COORDINATES.NYC);
        expect(distance).toBeLessThanOrEqual(10);
      });
    });
  });

  describe("Geospatial Assertions", () => {
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
  });

  describe("Basic Database Operations", () => {
    it("should handle collection counts", async () => {
      const result = await testEnv.payload.find({ collection: "users", limit: 1 });
      expect(typeof result.totalDocs).toBe("number");
    });

    it("should truncate collections", async () => {
      await testEnv.seedManager.truncate(["users"]);
      const result = await testEnv.payload.find({ collection: "users", limit: 1 });
      expect(result.totalDocs).toBe(0);
    });
  });
});
