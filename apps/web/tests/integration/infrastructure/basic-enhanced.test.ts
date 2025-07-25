/**
 * Basic Enhanced Testing Infrastructure Test
 *
 * Simple test to verify the core functionality works
 */

// Import geospatial assertions
import "../../utils/geospatial-assertions";

import { createIsolatedTestEnvironment } from "../../setup/test-helpers";
import { TEST_COORDINATES } from "../../utils/geospatial-assertions";
import { TestDataBuilder } from "../../utils/test-data-builder";

describe("Basic Enhanced Testing Infrastructure", () => {
  let testEnv: Awaited<ReturnType<typeof createIsolatedTestEnvironment>>;

  beforeAll(async () => {
    testEnv = await createIsolatedTestEnvironment();
  });

  afterAll(async () => {
    if (testEnv?.cleanup) {
      await testEnv.cleanup();
    }
  });

  describe("TestDataBuilder", () => {
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
        .buildMany(3, (event, i) => ({
          ...event,
          data: {
            ...(typeof event.data === "object" && event.data !== null && !Array.isArray(event.data) ? event.data : {}),
            title: `Meetup ${i + 1}`,
            capacity: 50 + i * 10,
          },
        }));

      expect(events).toHaveLength(3);
      events.forEach((event, i) => {
        expect((event.data as Record<string, unknown>).title).toBe(`Meetup ${i + 1}`);
        expect((event.data as Record<string, unknown>).category).toBe("Meetup");
        expect((event.data as Record<string, unknown>).capacity).toBe(50 + i * 10);

        // Check coordinates are near NYC (within 10km)
        expect(event.location).toBeWithinRadius(TEST_COORDINATES.NYC, 10);
      });
    });
  });

  describe("Geospatial Assertions", () => {
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
  });

  describe("Basic Database Operations", () => {
    it("should handle collection counts", async () => {
      const result = await testEnv.payload.find({ collection: "users", limit: 1 });
      expect(typeof result.totalDocs).toBe("number");
      expect(result.totalDocs).toBeGreaterThanOrEqual(0);
    });

    it("should truncate collections", async () => {
      await testEnv.seedManager.truncate(["users"]);
      const result = await testEnv.payload.find({ collection: "users", limit: 1 });
      expect(result.totalDocs).toBe(0);
    });
  });
});
