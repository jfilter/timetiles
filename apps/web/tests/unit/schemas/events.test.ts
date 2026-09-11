/**
 * Unit tests for event Zod schemas.
 *
 * @module
 * @category Tests
 */
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
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
    it.each(["rf", "ff"])("rejects entry arrays for %s", (parameter) => {
      expect(EventFiltersSchema.safeParse({ [parameter]: "[]" }).success).toBe(false);
    });

    it("validates prototype-named filter values", () => {
      expect(EventFiltersSchema.safeParse({ rf: '{"__proto__":{"min":50,"max":10}}' }).success).toBe(false);
      expect(EventFiltersSchema.safeParse({ ff: '{"__proto__":[42]}' }).success).toBe(false);
    });

    it("describes filter records as objects in OpenAPI", () => {
      const generated = new OpenApiGeneratorV3([
        { type: "schema", schema: EventFiltersSchema.openapi("Filters") },
      ]).generateComponents();
      const schema = generated.components?.schemas?.Filters;
      expect(schema).toMatchObject({
        properties: {
          ff: { type: "object", maxProperties: 20, additionalProperties: { type: "array", maxItems: 100 } },
          rf: { type: "object", maxProperties: 20, additionalProperties: { type: "object" } },
        },
      });
    });

    it("should accept empty filters", () => {
      const result = EventFiltersSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it("should accept catalog and dates", () => {
      const result = EventFiltersSchema.safeParse({ catalog: "1", startDate: "2024-01-01", endDate: "2024-12-31" });
      expect(result.success).toBe(true);
    });

    it("parses the rf range-filter param from a JSON string", () => {
      const result = EventFiltersSchema.safeParse({ rf: JSON.stringify({ price: { min: 10, max: 50 } }) });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.rf).toEqual({ price: { min: 10, max: 50 } });
      }
    });

    it.each([
      ["rf", { min: 10, max: 50 }],
      ["ff", ["selected"]],
    ])("preserves the __proto__ key in %s", (parameter, value) => {
      const filters = Object.fromEntries([["__proto__", value]]);
      const result = EventFiltersSchema.parse({ [parameter]: JSON.stringify(filters) });
      const parsed = parameter === "rf" ? result.rf : result.ff;
      expect(Object.entries(parsed)).toEqual(Object.entries(filters));
      expect(Object.getPrototypeOf(parsed)).toBe(Object.prototype);
    });

    it("defaults rf to an empty object when absent", () => {
      const absent = EventFiltersSchema.safeParse({});
      expect(absent.success && absent.data.rf).toEqual({});
    });

    it("rejects malformed rf/ff JSON instead of silently returning unfiltered data", () => {
      // Defaulting to {} made a broken filter return the FULL result set with HTTP 200 —
      // the caller asked to narrow the data and got all of it.
      expect(EventFiltersSchema.safeParse({ rf: "not-json" }).success).toBe(false);
      expect(EventFiltersSchema.safeParse({ ff: "not-json" }).success).toBe(false);
    });

    it("rejects an ff key longer than the field-key limit", () => {
      const longKey = "a".repeat(65);
      expect(EventFiltersSchema.safeParse({ ff: JSON.stringify({ [longKey]: ["x"] }) }).success).toBe(false);
    });

    it("rejects an rf entry whose min exceeds its max", () => {
      const result = EventFiltersSchema.safeParse({ rf: JSON.stringify({ price: { min: 50, max: 10 } }) });
      expect(result.success).toBe(false);
    });

    it("rejects rf with more than 20 keys", () => {
      const tooMany: Record<string, { min: number }> = {};
      for (let i = 0; i < 21; i++) tooMany[`f${i}`] = { min: i };
      const result = EventFiltersSchema.safeParse({ rf: JSON.stringify(tooMany) });
      expect(result.success).toBe(false);
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
        bounds: '{"north":52,"south":50,"east":14,"west":12}',
        zoom: 10,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.bounds).toEqual({ north: 52, south: 50, east: 14, west: 12 });
      }
    });

    it("should supply clustering defaults when options are omitted", () => {
      const result = MapClustersQuerySchema.safeParse({ bounds: '{"north":52,"south":50,"east":14,"west":12}' });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject({
          zoom: 10,
          targetClusters: 25,
          clusterAlgorithm: "h3",
          minPoints: 2,
          mergeOverlapping: true,
          h3ResolutionScale: 0.6,
          useHexCenter: false,
        });
      }
    });

    it("should preserve explicit boolean options", () => {
      const result = MapClustersQuerySchema.parse({ mergeOverlapping: "false", useHexCenter: "true" });
      expect(result.mergeOverlapping).toBe(false);
      expect(result.useHexCenter).toBe(true);
    });

    it("should reject invalid bounds JSON instead of dropping it", () => {
      // Dropping it produced a query with no spatial restriction at all — on the endpoints
      // where bounds is optional that answered 200 with every event worldwide.
      const result = MapClustersQuerySchema.safeParse({ bounds: '{"north":52}', zoom: 10 });
      expect(result.success).toBe(false);
    });
  });

  describe("ClusterStatsQuerySchema", () => {
    it("should accept empty filters", () => {
      const result = ClusterStatsQuerySchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });
});
