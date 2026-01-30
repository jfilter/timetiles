/**
 * Unit tests for coordinate formatting utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  formatCenterCoordinates,
  formatCoordinate,
  formatEventCount,
  getCenterFromBounds,
} from "@/lib/utils/coordinates";

describe("coordinates", () => {
  describe("getCenterFromBounds", () => {
    it("should calculate center of bounding box", () => {
      const center = getCenterFromBounds({ north: 41, south: 40, east: -73, west: -74 });
      expect(center).toEqual({ lat: 40.5, lon: -73.5 });
    });
  });

  describe("formatCoordinate", () => {
    it("should format positive latitude as N", () => {
      expect(formatCoordinate(40.7128, true)).toBe("40.71°N");
    });

    it("should format negative latitude as S", () => {
      expect(formatCoordinate(-33.8688, true)).toBe("33.87°S");
    });

    it("should format positive longitude as E", () => {
      expect(formatCoordinate(2.3522, false)).toBe("2.35°E");
    });

    it("should format negative longitude as W", () => {
      expect(formatCoordinate(-74.006, false)).toBe("74.01°W");
    });

    it("should respect custom precision", () => {
      expect(formatCoordinate(51.5074, true, 4)).toBe("51.5074°N");
    });
  });

  describe("formatCenterCoordinates", () => {
    it("should format center coordinates from bounds", () => {
      const result = formatCenterCoordinates({ north: 41, south: 40, east: -73, west: -74 });
      expect(result).toBe("40.50°N 73.50°W");
    });
  });

  describe("formatEventCount", () => {
    it("should format visible/total count", () => {
      expect(formatEventCount(327, 1240)).toBe("327 / 1,240");
    });

    it("should return null for undefined values", () => {
      expect(formatEventCount(undefined, undefined)).toBeNull();
    });

    it("should return null when visible is undefined", () => {
      expect(formatEventCount(undefined, 100)).toBeNull();
    });

    it("should return null when total is undefined", () => {
      expect(formatEventCount(100, undefined)).toBeNull();
    });
  });
});
