/**
 * Unit tests for geographic bounds validation utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { isValidBounds } from "@/lib/geospatial/bounds";

describe("isValidBounds", () => {
  describe("valid bounds", () => {
    it("should return true for valid bounds", () => {
      expect(isValidBounds({ north: 41, south: 40, east: -73, west: -74 })).toBe(true);
    });

    it("should return true for bounds at coordinate limits", () => {
      expect(isValidBounds({ north: 90, south: -90, east: 180, west: -180 })).toBe(true);
    });

    it("should return true for small bounds", () => {
      expect(isValidBounds({ north: 0.001, south: 0, east: 0.001, west: 0 })).toBe(true);
    });
  });

  describe("missing or non-object values", () => {
    it("should return false for null", () => {
      expect(isValidBounds(null)).toBe(false);
    });

    it("should return false for undefined", () => {
      expect(isValidBounds(undefined)).toBe(false);
    });

    it("should return false for a string", () => {
      expect(isValidBounds("not an object")).toBe(false);
    });

    it("should return false for a number", () => {
      expect(isValidBounds(42)).toBe(false);
    });

    it("should return false for an empty object", () => {
      expect(isValidBounds({})).toBe(false);
    });

    it("should return false when a field is missing", () => {
      expect(isValidBounds({ north: 41, south: 40, east: -73 })).toBe(false);
    });

    it("should return false when a field is a string", () => {
      expect(isValidBounds({ north: "41", south: 40, east: -73, west: -74 })).toBe(false);
    });
  });

  describe("NaN values", () => {
    it("should return false when north is NaN", () => {
      expect(isValidBounds({ north: NaN, south: 40, east: -73, west: -74 })).toBe(false);
    });

    it("should return false when south is NaN", () => {
      expect(isValidBounds({ north: 41, south: NaN, east: -73, west: -74 })).toBe(false);
    });

    it("should return false when east is NaN", () => {
      expect(isValidBounds({ north: 41, south: 40, east: NaN, west: -74 })).toBe(false);
    });

    it("should return false when west is NaN", () => {
      expect(isValidBounds({ north: 41, south: 40, east: -73, west: NaN })).toBe(false);
    });
  });

  describe("Infinity values", () => {
    it("should return false when north is Infinity", () => {
      expect(isValidBounds({ north: Infinity, south: 40, east: -73, west: -74 })).toBe(false);
    });

    it("should return false when south is -Infinity", () => {
      expect(isValidBounds({ north: 41, south: -Infinity, east: -73, west: -74 })).toBe(false);
    });

    it("should return false when east is Infinity", () => {
      expect(isValidBounds({ north: 41, south: 40, east: Infinity, west: -74 })).toBe(false);
    });

    it("should return false when west is -Infinity", () => {
      expect(isValidBounds({ north: 41, south: 40, east: -73, west: -Infinity })).toBe(false);
    });
  });

  describe("inverted bounds", () => {
    it("should return false when north < south", () => {
      expect(isValidBounds({ north: 40, south: 41, east: -73, west: -74 })).toBe(false);
    });

    it("should return false when north === south", () => {
      expect(isValidBounds({ north: 40, south: 40, east: -73, west: -74 })).toBe(false);
    });
  });

  describe("out-of-range coordinates", () => {
    it("should return false when north > 90", () => {
      expect(isValidBounds({ north: 91, south: 40, east: -73, west: -74 })).toBe(false);
    });

    it("should return false when south < -90", () => {
      expect(isValidBounds({ north: 41, south: -91, east: -73, west: -74 })).toBe(false);
    });

    it("should return false when east > 180", () => {
      expect(isValidBounds({ north: 41, south: 40, east: 181, west: -74 })).toBe(false);
    });

    it("should return false when west < -180", () => {
      expect(isValidBounds({ north: 41, south: 40, east: -73, west: -181 })).toBe(false);
    });
  });
});
