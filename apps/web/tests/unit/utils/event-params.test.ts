/**
 * Unit tests for event parameter utilities.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import {
  buildBaseEventParams,
  buildEventParams,
  extractBaseEventParameters,
  extractClusterStatsParameters,
  extractHistogramParameters,
  extractListParameters,
  extractMapClusterParameters,
} from "@/lib/utils/event-params";

describe("event-params", () => {
  describe("extractBaseEventParameters", () => {
    it("should extract catalog and dates", () => {
      const params = new URLSearchParams("catalog=test&startDate=2024-01-01&endDate=2024-12-31");
      const result = extractBaseEventParameters(params);
      expect(result.catalog).toBe("test");
      expect(result.startDate).toBe("2024-01-01");
      expect(result.endDate).toBe("2024-12-31");
    });

    it("should handle comma-separated datasets", () => {
      const params = new URLSearchParams("datasets=1,2,3");
      const result = extractBaseEventParameters(params);
      expect(result.datasets).toEqual(["1", "2", "3"]);
    });

    it("should handle multiple dataset params", () => {
      const params = new URLSearchParams("datasets=1&datasets=2");
      const result = extractBaseEventParameters(params);
      expect(result.datasets).toEqual(["1", "2"]);
    });

    it("should parse field filters from JSON", () => {
      const ff = JSON.stringify({ category: ["A", "B"] });
      const params = new URLSearchParams(`ff=${ff}`);
      const result = extractBaseEventParameters(params);
      expect(result.fieldFilters).toEqual({ category: ["A", "B"] });
    });

    it("should handle invalid ff JSON gracefully", () => {
      const params = new URLSearchParams("ff=not-json");
      const result = extractBaseEventParameters(params);
      expect(result.fieldFilters).toEqual({});
    });
  });

  describe("extractListParameters", () => {
    it("should extract page, limit, sort with defaults", () => {
      const params = new URLSearchParams("");
      const result = extractListParameters(params);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
      expect(result.sort).toBe("-eventTimestamp");
    });

    it("should cap limit at 1000", () => {
      const params = new URLSearchParams("limit=5000");
      const result = extractListParameters(params);
      expect(result.limit).toBe(1000);
    });
  });

  describe("extractHistogramParameters", () => {
    it("should extract bucket config with defaults", () => {
      const params = new URLSearchParams("");
      const result = extractHistogramParameters(params);
      expect(result.targetBuckets).toBe(30);
      expect(result.minBuckets).toBe(20);
      expect(result.maxBuckets).toBe(50);
    });
  });

  describe("extractMapClusterParameters", () => {
    it("should extract zoom with default", () => {
      const params = new URLSearchParams("zoom=5");
      const result = extractMapClusterParameters(params);
      expect(result.zoom).toBe(5);
    });
  });

  describe("extractClusterStatsParameters", () => {
    it("should return base parameters", () => {
      const params = new URLSearchParams("catalog=test");
      const result = extractClusterStatsParameters(params);
      expect(result.catalog).toBe("test");
    });
  });

  describe("buildBaseEventParams", () => {
    it("should build params from filter state", () => {
      const filters = {
        catalog: "my-catalog",
        datasets: ["d1", "d2"],
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        fieldFilters: { type: ["A"] },
      };
      const params = buildBaseEventParams(filters);
      expect(params.get("catalog")).toBe("my-catalog");
      expect(params.get("datasets")).toBe("d1,d2");
      expect(params.get("startDate")).toBe("2024-01-01");
      expect(params.get("endDate")).toBe("2024-12-31");
      expect(params.get("ff")).toBe(JSON.stringify({ type: ["A"] }));
    });

    it("should skip empty values", () => {
      const filters = {
        catalog: null,
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: {},
      };
      const params = buildBaseEventParams(filters);
      expect(params.toString()).toBe("");
    });

    it("should include additional params", () => {
      const filters = { catalog: null, datasets: [], startDate: null, endDate: null, fieldFilters: {} };
      const params = buildBaseEventParams(filters, { extra: "value" });
      expect(params.get("extra")).toBe("value");
    });
  });

  describe("buildEventParams", () => {
    it("should include SimpleBounds", () => {
      const filters = { catalog: null, datasets: [], startDate: null, endDate: null, fieldFilters: {} };
      const bounds = { north: 41, south: 40, east: -73, west: -74 };
      const params = buildEventParams(filters, bounds);
      const parsed = JSON.parse(params.get("bounds")!);
      expect(parsed).toEqual({ north: 41, south: 40, east: -73, west: -74 });
    });

    it("should handle LngLatBounds-like objects", () => {
      const filters = { catalog: null, datasets: [], startDate: null, endDate: null, fieldFilters: {} };
      const bounds = {
        getWest: () => -74,
        getSouth: () => 40,
        getEast: () => -73,
        getNorth: () => 41,
      };
      const params = buildEventParams(filters, bounds as any);
      const parsed = JSON.parse(params.get("bounds")!);
      expect(parsed).toEqual({ west: -74, south: 40, east: -73, north: 41 });
    });

    it("should skip null bounds", () => {
      const filters = { catalog: null, datasets: [], startDate: null, endDate: null, fieldFilters: {} };
      const params = buildEventParams(filters, null);
      expect(params.get("bounds")).toBeNull();
    });
  });
});
