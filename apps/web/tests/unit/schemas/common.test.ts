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
      const result = BoundsSchema.safeParse({
        north: 52.5,
        south: 52.3,
        east: 13.5,
        west: 13.3,
      });
      expect(result.success).toBe(true);
    });

    it("should reject out-of-range latitude", () => {
      const result = BoundsSchema.safeParse({
        north: 91,
        south: 52.3,
        east: 13.5,
        west: 13.3,
      });
      expect(result.success).toBe(false);
    });

    it("should reject out-of-range longitude", () => {
      const result = BoundsSchema.safeParse({
        north: 52.5,
        south: 52.3,
        east: 181,
        west: 13.3,
      });
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
      const result = ErrorResponseSchema.safeParse({
        error: "Not found",
        code: "NOT_FOUND",
        details: { id: 123 },
      });
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
  });
});
