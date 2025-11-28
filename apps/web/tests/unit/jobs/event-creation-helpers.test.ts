/**
 * Unit tests for event creation helper functions.
 *
 * @module
 */
import { describe, expect, it } from "vitest";

import { extractCoordinates } from "@/lib/jobs/utils/event-creation-helpers";

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
      const geocodingResults = {
        "Berlin Germany": {
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
      const geocodingResults = {
        "Munich Germany": {
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
      const fieldMappings = {
        latitudePath: "latitude",
        longitudePath: "longitude",
        locationPath: "location",
      };
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
