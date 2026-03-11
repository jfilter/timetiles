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
      const filters = { catalog: null, datasets: [], startDate: null, endDate: null, fieldFilters: {} };
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
      const bounds = { getWest: () => -74, getSouth: () => 40, getEast: () => -73, getNorth: () => 41 };
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
