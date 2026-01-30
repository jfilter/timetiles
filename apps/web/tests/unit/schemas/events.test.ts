/**
 * Unit tests for event Zod schemas.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  AggregateQuerySchema,
  ClusterStatsQuerySchema,
  EventFiltersSchema,
  EventItemSchema,
  EventListQuerySchema,
  HistogramQuerySchema,
  MapClustersQuerySchema,
} from "@/lib/schemas/events";

describe("event schemas", () => {
  describe("EventFiltersSchema", () => {
    it("should accept empty filters", () => {
      const result = EventFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept catalog and dates", () => {
      const result = EventFiltersSchema.safeParse({
        catalog: "1",
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("EventListQuerySchema", () => {
    it("should apply defaults", () => {
      const result = EventListQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.page).toBe(1);
        expect(result.data.limit).toBe(100);
        expect(result.data.sort).toBe("-eventTimestamp");
      }
    });

    it("should accept custom sort", () => {
      const result = EventListQuerySchema.safeParse({ sort: "title" });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sort).toBe("title");
      }
    });
  });

  describe("EventItemSchema", () => {
    it("should accept valid event item", () => {
      const result = EventItemSchema.safeParse({
        id: 1,
        dataset: { id: 1, title: "Test" },
        data: { key: "value" },
        location: { longitude: 13.4, latitude: 52.5 },
        eventTimestamp: "2024-01-01T00:00:00Z",
        isValid: true,
      });
      expect(result.success).toBe(true);
    });

    it("should accept null location", () => {
      const result = EventItemSchema.safeParse({
        id: 1,
        dataset: { id: 1 },
        data: {},
        location: null,
        eventTimestamp: "2024-01-01T00:00:00Z",
        isValid: true,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("AggregateQuerySchema", () => {
    it("should require groupBy", () => {
      const result = AggregateQuerySchema.safeParse({ groupBy: "catalog" });
      expect(result.success).toBe(true);
    });

    it("should reject invalid groupBy", () => {
      const result = AggregateQuerySchema.safeParse({ groupBy: "invalid" });
      expect(result.success).toBe(false);
    });
  });

  describe("HistogramQuerySchema", () => {
    it("should apply bucket defaults", () => {
      const result = HistogramQuerySchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.targetBuckets).toBe(30);
        expect(result.data.minBuckets).toBe(20);
        expect(result.data.maxBuckets).toBe(50);
      }
    });
  });

  describe("MapClustersQuerySchema", () => {
    it("should accept required bounds and zoom", () => {
      const result = MapClustersQuerySchema.safeParse({
        bounds: '{"north":52}',
        zoom: 10,
      });
      expect(result.success).toBe(true);
    });

    it("should default zoom to 10", () => {
      const result = MapClustersQuerySchema.safeParse({
        bounds: '{"north":52}',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.zoom).toBe(10);
      }
    });
  });

  describe("ClusterStatsQuerySchema", () => {
    it("should accept empty filters", () => {
      const result = ClusterStatsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
