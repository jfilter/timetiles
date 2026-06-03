/**
 * Unit tests for common Zod schemas.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  BoundsParamSchema,
  BoundsSchema,
  CatalogParamSchema,
  DatasetsParamSchema,
  ErrorResponseSchema,
  PaginationSchema,
} from "@/lib/schemas/common";

describe("common schemas", () => {
  describe("BoundsSchema", () => {
    it("should accept valid bounds", () => {
      const result = BoundsSchema.safeParse({ north: 52.5, south: 52.3, east: 13.5, west: 13.3 });
      expect(result.success).toBe(true);
    });

    it("should reject out-of-range latitude", () => {
      const result = BoundsSchema.safeParse({ north: 91, south: 52.3, east: 13.5, west: 13.3 });
      expect(result.success).toBe(false);
    });

    it("should reject out-of-range longitude", () => {
      const result = BoundsSchema.safeParse({ north: 52.5, south: 52.3, east: 181, west: 13.3 });
      expect(result.success).toBe(false);
    });

    it("should reject missing fields", () => {
      const result = BoundsSchema.safeParse({ north: 52.5 });
      expect(result.success).toBe(false);
    });
  });

  describe("PaginationSchema", () => {
    it("should accept valid pagination", () => {
      const result = PaginationSchema.safeParse({ page: 1, limit: 50 });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(50);
      }
    });

    it("should use defaults for missing values", () => {
      const result = PaginationSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(100);
      }
    });

    it("should coerce string numbers", () => {
      const result = PaginationSchema.safeParse({ page: "2", limit: "25" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(2);
        expect(result.data.limit).toBe(25);
      }
    });

    it("should reject page less than 1", () => {
      const result = PaginationSchema.safeParse({ page: 0 });
      expect(result.success).toBe(false);
    });

    it("should reject limit above 1000", () => {
      const result = PaginationSchema.safeParse({ limit: 1001 });
      expect(result.success).toBe(false);
    });
  });

  describe("ErrorResponseSchema", () => {
    it("should accept error with message", () => {
      const result = ErrorResponseSchema.safeParse({ error: "Something went wrong" });
      expect(result.success).toBe(true);
    });

    it("should accept error with code and details", () => {
      const result = ErrorResponseSchema.safeParse({ error: "Not found", code: "NOT_FOUND", details: { id: 123 } });
      expect(result.success).toBe(true);
    });
  });

  describe("DatasetsParamSchema", () => {
    it("should parse comma-separated string", () => {
      const result = DatasetsParamSchema.safeParse("1,2,3");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([1, 2, 3]);
      }
    });

    it("should parse array of strings", () => {
      const result = DatasetsParamSchema.safeParse(["1", "2", "3"]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([1, 2, 3]);
      }
    });

    it("should handle mixed array with comma-separated values", () => {
      const result = DatasetsParamSchema.safeParse(["1,2", "3"]);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([1, 2, 3]);
      }
    });

    it("should return empty array for non-array/string", () => {
      const result = DatasetsParamSchema.safeParse(null);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual([]);
      }
    });
  });

  describe("CatalogParamSchema", () => {
    it("should coerce string to number", () => {
      const result = CatalogParamSchema.safeParse("5");
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe(5);
      }
    });

    it("should accept undefined", () => {
      const result = CatalogParamSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });
  });

  describe("BoundsParamSchema", () => {
    it("should accept string", () => {
      const result = BoundsParamSchema.safeParse('{"north":52}');
      expect(result.success).toBe(true);
    });

    it("should accept undefined", () => {
      const result = BoundsParamSchema.safeParse(undefined);
      expect(result.success).toBe(true);
    });

    it("should pass normal bounds through unchanged", () => {
      const result = BoundsParamSchema.safeParse('{"north":37.8,"south":37.7,"east":-122.4,"west":-122.5}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ north: 37.8, south: 37.7, east: -122.4, west: -122.5 });
    });

    it("should accept the world-zoom viewport with an unwrapped west instead of rejecting it", () => {
      // MapLibre getBounds() on the initial world view reports unwrapped
      // longitudes (observed in prod as west=-197.41). The wrapped result has
      // west > east — the antimeridian-crossing encoding the query layer
      // resolves with an OR longitude filter.
      const result = BoundsParamSchema.safeParse('{"north":85.05,"south":-82.17,"east":72.45,"west":-197.5}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ north: 85.05, south: -82.17, east: 72.45, west: 162.5 });
    });

    it("should pass in-range antimeridian-crossing bounds (west > east) through unchanged", () => {
      const result = BoundsParamSchema.safeParse('{"north":10,"south":-10,"east":-170,"west":170}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ north: 10, south: -10, east: -170, west: 170 });
    });

    it("should keep a legal east=180 edge untouched", () => {
      const result = BoundsParamSchema.safeParse('{"north":40,"south":30,"east":180,"west":0}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ north: 40, south: 30, east: 180, west: 0 });
    });

    it("should collapse spans of 360 degrees or more to the full world", () => {
      const result = BoundsParamSchema.safeParse('{"north":85,"south":-85,"east":200,"west":-200}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ north: 85, south: -85, east: 180, west: -180 });
    });

    it("should wrap a viewport that sits entirely beyond the antimeridian", () => {
      const result = BoundsParamSchema.safeParse('{"north":40,"south":30,"east":190,"west":185}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ north: 40, south: 30, east: -170, west: -175 });
    });

    it("should wrap an unwrapped dateline crossing into the west > east encoding", () => {
      // west=175, east=185 → east wraps to -175; west > east is preserved as
      // the antimeridian-crossing encoding (OR longitude filter downstream).
      const result = BoundsParamSchema.safeParse('{"north":40,"south":30,"east":185,"west":175}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ north: 40, south: 30, east: -175, west: 175 });
    });

    it("should clamp out-of-range latitudes", () => {
      const result = BoundsParamSchema.safeParse('{"north":95,"south":-95,"east":10,"west":-10}');
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ north: 90, south: -90, east: 10, west: -10 });
    });

    it("should still reject garbage bounds (north <= south, non-finite values)", () => {
      const inverted = BoundsParamSchema.safeParse('{"north":10,"south":20,"east":10,"west":-10}');
      expect(inverted.success).toBe(true);
      expect(inverted.data).toBeUndefined();

      const nonNumeric = BoundsParamSchema.safeParse('{"north":"x","south":-10,"east":10,"west":-10}');
      expect(nonNumeric.success).toBe(true);
      expect(nonNumeric.data).toBeUndefined();
    });
  });
});
