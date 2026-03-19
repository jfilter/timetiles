/**
 * Unit tests for event creation helper functions.
 *
 * @module
 */
import "@/tests/mocks/services/logger";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Use vi.hoisted to prevent thread-pool mock contamination from other test files
const mocks = vi.hoisted(() => ({ generateUniqueId: vi.fn(() => "generated-id") }));

vi.mock("@/lib/services/id-generation", () => ({ generateUniqueId: mocks.generateUniqueId }));

import { createEventData, extractCoordinates, extractTimestamp } from "@/lib/jobs/utils/event-creation-helpers";

// Reset mock before each test to guard against thread-pool contamination
beforeEach(() => {
  mocks.generateUniqueId.mockReturnValue("generated-id");
});

describe("extractCoordinates", () => {
  describe("with import coordinates", () => {
    it("should extract coordinates from lat/lng fields", () => {
      const row = { latitude: 52.52, longitude: 13.405 };
      const fieldMappings = { latitudePath: "latitude", longitudePath: "longitude" };

      const result = extractCoordinates(row, fieldMappings, {});

      expect(result.location).toEqual({ latitude: 52.52, longitude: 13.405 });
      expect(result.coordinateSource.type).toBe("import");
      expect(result.coordinateSource.normalizedAddress).toBeUndefined();
    });

    it("should reject invalid coordinates", () => {
      const row = { latitude: 999, longitude: 13.405 }; // Invalid latitude
      const fieldMappings = { latitudePath: "latitude", longitudePath: "longitude" };

      const result = extractCoordinates(row, fieldMappings, {});

      expect(result.location).toBeUndefined();
      expect(result.coordinateSource.type).toBe("none");
    });
  });

  describe("with geocoded coordinates", () => {
    it("should extract geocoded coordinates with normalizedAddress", () => {
      const row = { location: "Berlin Germany" };
      const fieldMappings = { locationPath: "location" };
      // Results are keyed by normalized address (lowercase, trimmed)
      const geocodingResults = {
        "berlin germany": {
          coordinates: { lat: 52.52, lng: 13.405 },
          confidence: 0.9,
          formattedAddress: "Berlin, Germany",
        },
      };

      const result = extractCoordinates(row, fieldMappings, geocodingResults);

      expect(result.location).toEqual({ latitude: 52.52, longitude: 13.405 });
      expect(result.coordinateSource.type).toBe("geocoded");
      expect(result.coordinateSource.confidence).toBe(0.9);
      expect(result.coordinateSource.normalizedAddress).toBe("Berlin, Germany");
    });

    it("should trim whitespace from location values", () => {
      const row = { location: "  Munich Germany  " };
      const fieldMappings = { locationPath: "location" };
      // Results keyed by normalized form (whitespace trimmed + lowercased)
      const geocodingResults = {
        "munich germany": {
          coordinates: { lat: 48.137, lng: 11.576 },
          confidence: 0.85,
          formattedAddress: "Munich, Bavaria, Germany",
        },
      };

      const result = extractCoordinates(row, fieldMappings, geocodingResults);

      expect(result.location).toEqual({ latitude: 48.137, longitude: 11.576 });
      expect(result.coordinateSource.normalizedAddress).toBe("Munich, Bavaria, Germany");
    });

    it("should return none when location not found in geocoding results", () => {
      const row = { location: "Unknown Place" };
      const fieldMappings = { locationPath: "location" };
      const geocodingResults = {
        "Berlin Germany": {
          coordinates: { lat: 52.52, lng: 13.405 },
          confidence: 0.9,
          formattedAddress: "Berlin, Germany",
        },
      };

      const result = extractCoordinates(row, fieldMappings, geocodingResults);

      expect(result.location).toBeUndefined();
      expect(result.coordinateSource.type).toBe("none");
    });
  });

  describe("priority order", () => {
    it("should prefer import coordinates over geocoded", () => {
      const row = { latitude: 40.7128, longitude: -74.006, location: "Berlin Germany" };
      const fieldMappings = { latitudePath: "latitude", longitudePath: "longitude", locationPath: "location" };
      const geocodingResults = {
        "Berlin Germany": {
          coordinates: { lat: 52.52, lng: 13.405 },
          confidence: 0.9,
          formattedAddress: "Berlin, Germany",
        },
      };

      const result = extractCoordinates(row, fieldMappings, geocodingResults);

      // Should use import coordinates, not geocoded
      expect(result.location).toEqual({ latitude: 40.7128, longitude: -74.006 });
      expect(result.coordinateSource.type).toBe("import");
      expect(result.coordinateSource.normalizedAddress).toBeUndefined();
    });
  });
});

describe("extractTimestamp", () => {
  describe("mapped field", () => {
    it("should return a valid Date when mapped field has a valid timestamp", () => {
      const row = { event_date: "2024-06-15T10:30:00Z" };
      const result = extractTimestamp(row, "event_date");

      expect(result).toBeInstanceOf(Date);
      expect(result!.toISOString()).toBe("2024-06-15T10:30:00.000Z");
    });

    it("should return a valid Date when mapped field has a numeric timestamp", () => {
      const row = { ts: 1718451000000 };
      const result = extractTimestamp(row, "ts");

      expect(result).toBeInstanceOf(Date);
      expect(result!.getTime()).toBe(1718451000000);
    });
  });

  describe("fallback fields", () => {
    it("should return a valid Date from 'date' fallback field", () => {
      const row = { date: "2024-03-01" };
      const result = extractTimestamp(row);

      expect(result).toBeInstanceOf(Date);
      expect(result!.getFullYear()).toBe(2024);
    });

    it("should return a valid Date from 'timestamp' fallback field", () => {
      const row = { timestamp: "2024-07-20T14:00:00Z" };
      const result = extractTimestamp(row);

      expect(result).toBeInstanceOf(Date);
      expect(result!.toISOString()).toBe("2024-07-20T14:00:00.000Z");
    });

    it("should return a valid Date from 'created_at' fallback field", () => {
      const row = { created_at: "2024-01-10" };
      const result = extractTimestamp(row);

      expect(result).toBeInstanceOf(Date);
    });
  });

  describe("no valid timestamp", () => {
    it("should return null when no timestamp fields exist", () => {
      const row = { name: "test", value: 42 };
      const result = extractTimestamp(row);

      expect(result).toBeNull();
    });

    it("should return null when mapped field is missing from row", () => {
      const row = { name: "test" };
      const result = extractTimestamp(row, "nonexistent_field");

      expect(result).toBeNull();
    });

    it("should return null when row is empty", () => {
      const result = extractTimestamp({});

      expect(result).toBeNull();
    });
  });

  describe("invalid date strings", () => {
    it("should return null for an invalid date string in mapped field", () => {
      const row = { event_date: "not-a-date" };
      const result = extractTimestamp(row, "event_date");

      expect(result).toBeNull();
    });

    it("should return null for an invalid date string in fallback field", () => {
      const row = { date: "garbage-value" };
      const result = extractTimestamp(row);

      expect(result).toBeNull();
    });
  });
});

describe("createEventData", () => {
  it("does not coerce partially numeric import job ids into event relations", () => {
    const result = createEventData(
      { title: "Test Event", date: "2024-06-15T10:30:00Z" },
      { id: 42, idStrategy: { type: "auto", duplicateStrategy: "skip" } } as any,
      "123abc",
      {},
      {},
      null
    );

    expect(result.importJob).toBeUndefined();
    expect(result.uniqueId).toBe("generated-id");
  });
});
