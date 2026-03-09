/**
 * Unit tests for geographic bounds validation utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { createBoundingBox, isValidBounds, isWithinBounds } from "@/lib/geospatial/bounds";

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

describe("isWithinBounds", () => {
  it("returns true for points inside antimeridian-crossing bounds", () => {
    expect(
      isWithinBounds(
        { latitude: 0, longitude: 175 },
        { north: 10, south: -10, west: 170, east: -170 }
      )
    ).toBe(true);

    expect(
      isWithinBounds(
        { latitude: 0, longitude: -175 },
        { north: 10, south: -10, west: 170, east: -170 }
      )
    ).toBe(true);
  });
});

describe("createBoundingBox", () => {
  it("wraps longitudes that cross the antimeridian", () => {
    const bounds = createBoundingBox({ latitude: 0, longitude: 179.8 }, 50);

    expect(bounds.east).toBeLessThanOrEqual(180);
    expect(bounds.east).toBeCloseTo(-179.7495, 3);
    expect(bounds.west).toBeCloseTo(179.3495, 3);
    expect(isValidBounds(bounds)).toBe(true);
  });

  it("clamps latitudes that would extend past the poles", () => {
    const bounds = createBoundingBox({ latitude: 89.9, longitude: 0 }, 50);

    expect(bounds.north).toBe(90);
    expect(bounds.south).toBeLessThan(90);
    expect(isValidBounds(bounds)).toBe(true);
  });
});
