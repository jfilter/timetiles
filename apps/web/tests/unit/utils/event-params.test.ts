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
  normalizeStrictIntegerList,
  parseStrictInteger,
} from "@/lib/utils/event-params";

describe("event-params", () => {
  describe("parseStrictInteger", () => {
    it("parses fully numeric strings", () => {
      expect(parseStrictInteger("42")).toBe(42);
      expect(parseStrictInteger("  -7 ")).toBe(-7);
    });

    it("rejects partially numeric strings", () => {
      expect(parseStrictInteger("42abc")).toBeNull();
      expect(parseStrictInteger("abc42")).toBeNull();
    });
  });

  describe("normalizeStrictIntegerList", () => {
    it("keeps only fully numeric values", () => {
      expect(normalizeStrictIntegerList(["10", "20oops", 30])).toEqual([10, 30]);
    });
  });

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

    it("treats blank catalog and date params as absent", () => {
      const params = new URLSearchParams("catalog=&startDate=&endDate=");
      const result = extractBaseEventParameters(params);
      expect(result.catalog).toBeNull();
      expect(result.startDate).toBeNull();
      expect(result.endDate).toBeNull();
    });

    describe("field filter validation", () => {
      it("should allow valid alphanumeric field keys", () => {
        const ff = JSON.stringify({ category: ["A"], event_type: ["B"], my_field_2: ["C"] });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toEqual({ category: ["A"], event_type: ["B"], my_field_2: ["C"] });
      });

      it("should allow hyphens in field keys", () => {
        const ff = JSON.stringify({ "event-type": ["A"] });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toEqual({ "event-type": ["A"] });
      });

      it("should allow nested field paths", () => {
        const ff = JSON.stringify({ "nested.path": ["A"], valid: ["B"] });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toEqual({ "nested.path": ["A"], valid: ["B"] });
      });

      it("should allow deeply nested field paths", () => {
        const ff = JSON.stringify({ "nested.path.value": ["A"], valid: ["B"] });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toEqual({ "nested.path.value": ["A"], valid: ["B"] });
      });

      it("should strip malformed dotted field paths", () => {
        const ff = JSON.stringify({
          ".leading": ["A"],
          "trailing.": ["B"],
          "double..dot": ["C"],
          valid: ["D"],
        });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toEqual({ valid: ["D"] });
      });

      it("should strip field keys with special characters", () => {
        const ff = JSON.stringify({ "field;DROP TABLE": ["A"], "field<script>": ["B"], ok: ["C"] });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toEqual({ ok: ["C"] });
      });

      it("should strip field keys exceeding max length", () => {
        const longKey = "a".repeat(65);
        const ff = JSON.stringify({ [longKey]: ["A"], short: ["B"] });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toEqual({ short: ["B"] });
      });

      it("should allow field keys at max length (64 chars)", () => {
        const maxKey = "a".repeat(64);
        const ff = JSON.stringify({ [maxKey]: ["A"] });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toHaveProperty(maxKey);
      });

      it("should limit to 10 field filters", () => {
        const filters: Record<string, string[]> = {};
        for (let i = 0; i < 15; i++) {
          filters[`field${i}`] = ["value"];
        }
        const ff = JSON.stringify(filters);
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(Object.keys(result.fieldFilters).length).toBe(10);
      });

      it("should filter out non-string values from arrays", () => {
        const ff = JSON.stringify({ category: ["A", 123, null, "B"] });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toEqual({ category: ["A", "B"] });
      });

      it("should skip keys with non-array values", () => {
        const ff = JSON.stringify({ category: "not-an-array", valid: ["A"] });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toEqual({ valid: ["A"] });
      });

      it("should skip keys with empty valid arrays", () => {
        const ff = JSON.stringify({ empty: [], noStrings: [1, 2, 3], valid: ["A"] });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toEqual({ valid: ["A"] });
      });

      it("should strip empty string keys", () => {
        const ff = JSON.stringify({ "": ["A"], valid: ["B"] });
        const params = new URLSearchParams(`ff=${ff}`);
        const result = extractBaseEventParameters(params);
        expect(result.fieldFilters).toEqual({ valid: ["B"] });
      });
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

    it("should fall back to the default sort when sort is blank", () => {
      const params = new URLSearchParams("sort=");
      const result = extractListParameters(params);
      expect(result.sort).toBe("-eventTimestamp");
    });

    it("should cap limit at 1000", () => {
      const params = new URLSearchParams("limit=5000");
      const result = extractListParameters(params);
      expect(result.limit).toBe(1000);
    });

    it("should fall back to 1 when page is NaN", () => {
      const params = new URLSearchParams("page=abc");
      const result = extractListParameters(params);
      expect(result.page).toBe(1);
    });

    it("should clamp page to 1 when page is negative", () => {
      const params = new URLSearchParams("page=-5");
      const result = extractListParameters(params);
      expect(result.page).toBe(1);
    });

    it("should clamp page to 1 when page is 0", () => {
      const params = new URLSearchParams("page=0");
      const result = extractListParameters(params);
      expect(result.page).toBe(1);
    });

    it("should fall back to 100 when limit is NaN", () => {
      const params = new URLSearchParams("limit=abc");
      const result = extractListParameters(params);
      expect(result.limit).toBe(100);
    });

    it("should clamp limit to 1 when limit is negative", () => {
      const params = new URLSearchParams("limit=-1");
      const result = extractListParameters(params);
      expect(result.limit).toBe(1);
    });

    it("should reject partially numeric page and limit values", () => {
      const params = new URLSearchParams("page=2abc&limit=50xyz");
      const result = extractListParameters(params);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
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

    it("should fall back to 30 when targetBuckets is NaN", () => {
      const params = new URLSearchParams("targetBuckets=abc");
      const result = extractHistogramParameters(params);
      expect(result.targetBuckets).toBe(30);
    });

    it("should clamp targetBuckets to 500 when value exceeds max", () => {
      const params = new URLSearchParams("targetBuckets=999999");
      const result = extractHistogramParameters(params);
      expect(result.targetBuckets).toBe(500);
    });

    it("should clamp targetBuckets to 1 when value is negative", () => {
      const params = new URLSearchParams("targetBuckets=-1");
      const result = extractHistogramParameters(params);
      expect(result.targetBuckets).toBe(1);
    });

    it("should reject partially numeric bucket values", () => {
      const params = new URLSearchParams("targetBuckets=42abc&minBuckets=7xyz&maxBuckets=88oops");
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

    it("should fall back to 10 when zoom is NaN", () => {
      const params = new URLSearchParams("zoom=abc");
      const result = extractMapClusterParameters(params);
      expect(result.zoom).toBe(10);
    });

    it("should clamp zoom to 28 when value exceeds max", () => {
      const params = new URLSearchParams("zoom=99");
      const result = extractMapClusterParameters(params);
      expect(result.zoom).toBe(28);
    });

    it("should clamp zoom to 0 when value is negative", () => {
      const params = new URLSearchParams("zoom=-5");
      const result = extractMapClusterParameters(params);
      expect(result.zoom).toBe(0);
    });

    it("should reject partially numeric zoom values", () => {
      const params = new URLSearchParams("zoom=5abc");
      const result = extractMapClusterParameters(params);
      expect(result.zoom).toBe(10);
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
