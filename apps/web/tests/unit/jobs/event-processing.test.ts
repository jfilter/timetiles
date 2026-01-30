/**
 * Unit tests for event processing utilities.
 *
 * @module
 * @category Tests
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockParseCoordinate } = vi.hoisted(() => ({
  mockParseCoordinate: vi.fn(),
}));

vi.mock("@/lib/geospatial", () => ({
  parseCoordinate: mockParseCoordinate,
}));

vi.mock("@/lib/utils/date", () => ({
  isValidDate: (d: Date) => !isNaN(d.getTime()),
}));

import { extractCoordinatesFromRow, processRowData } from "@/lib/jobs/utils/event-processing";

describe("event-processing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("extractCoordinatesFromRow", () => {
    it("should return empty object when no columns configured", () => {
      const result = extractCoordinatesFromRow({ lat: "52.5", lng: "13.4" }, {});
      expect(result).toEqual({});
    });

    it("should extract from separate lat/lng columns", () => {
      mockParseCoordinate.mockImplementation((v: string) => parseFloat(v));

      const row = { latitude: "52.5", longitude: "13.4" };
      const result = extractCoordinatesFromRow(row, {
        latitudeColumn: "latitude",
        longitudeColumn: "longitude",
      });

      expect(result.coordinates).toEqual({ lat: 52.5, lng: 13.4 });
    });

    it("should return empty when lat column missing value", () => {
      const row = { latitude: null, longitude: "13.4" };
      const result = extractCoordinatesFromRow(row, {
        latitudeColumn: "latitude",
        longitudeColumn: "longitude",
      });
      expect(result).toEqual({});
    });

    it("should return empty when only latitudeColumn specified", () => {
      const row = { latitude: "52.5" };
      const result = extractCoordinatesFromRow(row, {
        latitudeColumn: "latitude",
      });
      expect(result).toEqual({});
    });

    it("should extract from combined comma format", () => {
      mockParseCoordinate.mockImplementation((v: string) => parseFloat(v));

      const row = { coords: "52.5, 13.4" };
      const result = extractCoordinatesFromRow(row, {
        combinedColumn: "coords",
        coordinateFormat: "combined_comma",
      });

      expect(result.coordinates).toEqual({ lat: 52.5, lng: 13.4 });
    });

    it("should extract from combined space format", () => {
      mockParseCoordinate.mockImplementation((v: string) => parseFloat(v));

      const row = { coords: "52.5 13.4" };
      const result = extractCoordinatesFromRow(row, {
        combinedColumn: "coords",
        coordinateFormat: "combined_space",
      });

      expect(result.coordinates).toEqual({ lat: 52.5, lng: 13.4 });
    });

    it("should return empty for invalid combined format", () => {
      const row = { coords: "invalid" };
      const result = extractCoordinatesFromRow(row, {
        combinedColumn: "coords",
        coordinateFormat: "combined_comma",
      });
      expect(result).toEqual({});
    });

    it("should return empty when parseCoordinate returns null", () => {
      mockParseCoordinate.mockReturnValue(null);

      const row = { latitude: "52.5", longitude: "13.4" };
      const result = extractCoordinatesFromRow(row, {
        latitudeColumn: "latitude",
        longitudeColumn: "longitude",
      });
      expect(result).toEqual({});
    });

    it("should handle numeric coordinate values", () => {
      mockParseCoordinate.mockImplementation((v: string) => parseFloat(v));

      const row = { latitude: 52.5, longitude: 13.4 };
      const result = extractCoordinatesFromRow(row, {
        latitudeColumn: "latitude",
        longitudeColumn: "longitude",
      });

      expect(result.coordinates).toEqual({ lat: 52.5, lng: 13.4 });
    });

    it("should return empty for non-string/number lat value", () => {
      const row = { latitude: { nested: true }, longitude: "13.4" };
      const result = extractCoordinatesFromRow(row, {
        latitudeColumn: "latitude",
        longitudeColumn: "longitude",
      });
      expect(result).toEqual({});
    });

    it("should return empty for non-string/number combined value", () => {
      const row = { coords: { nested: true } };
      const result = extractCoordinatesFromRow(row, {
        combinedColumn: "coords",
        coordinateFormat: "combined_comma",
      });
      expect(result).toEqual({});
    });

    it("should return empty when combined column is empty string", () => {
      const result = extractCoordinatesFromRow(
        {},
        {
          combinedColumn: "",
          coordinateFormat: "combined_comma",
        }
      );
      expect(result).toEqual({});
    });

    it("should prefer separate columns over combined", () => {
      mockParseCoordinate.mockImplementation((v: string) => parseFloat(v));

      const row = { latitude: "52.5", longitude: "13.4", coords: "0, 0" };
      const result = extractCoordinatesFromRow(row, {
        latitudeColumn: "latitude",
        longitudeColumn: "longitude",
        combinedColumn: "coords",
        coordinateFormat: "combined_comma",
      });

      expect(result.coordinates).toEqual({ lat: 52.5, lng: 13.4 });
    });
  });

  describe("processRowData", () => {
    it("should process basic row data", () => {
      const row = {
        title: "Test Event",
        description: "A test description",
        date: "2024-01-01",
        location: "Berlin",
      };

      const result = processRowData(row, false, undefined);

      expect(result.title).toBe("Test Event");
      expect(result.description).toBe("A test description");
      expect(result.location).toBe("Berlin");
      expect(result.originalData).toBe(row);
    });

    it("should include coordinates when available", () => {
      mockParseCoordinate.mockImplementation((v: string) => parseFloat(v));

      const row = {
        title: "Test",
        date: "2024-01-01",
        latitude: "52.5",
        longitude: "13.4",
      };

      const result = processRowData(row, true, {
        latitudeColumn: "latitude",
        longitudeColumn: "longitude",
      });

      expect(result.preExistingCoordinates).toEqual({ lat: 52.5, lng: 13.4 });
      expect(result.skipGeocoding).toBe(true);
    });

    it("should handle missing optional fields", () => {
      const row = { title: "Minimal" };
      const result = processRowData(row, false, undefined);

      expect(result.title).toBe("Minimal");
      expect(result.description).toBe("");
      expect(result.location).toBe("");
    });
  });
});
