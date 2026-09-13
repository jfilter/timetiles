/**
 * Unit tests for store helper functions.
 *
 * Tests filter state management utilities including counting active filters,
 * checking filter presence, and clearing all filters.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import type { FilterState } from "../../../lib/types/filter-state";
import { clearAllFilters, getActiveFilterCount, hasActiveFilters } from "../../../lib/types/filter-state";

describe("Filter State Helper Functions", () => {
  describe("getActiveFilterCount", () => {
    it("should return 0 for empty filters", () => {
      const filters: FilterState = { datasets: [], startDate: null, endDate: null, fieldFilters: {}, rangeFilters: {} };

      expect(getActiveFilterCount(filters)).toBe(0);
    });

    it("should not count datasets (they are selection, not filters)", () => {
      const filters: FilterState = {
        datasets: ["dataset-1", "dataset-2", "dataset-3"],
        startDate: null,
        endDate: null,
        fieldFilters: {},
        rangeFilters: {},
      };

      expect(getActiveFilterCount(filters)).toBe(0);
    });

    it("should count date range as one filter when both dates present", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        fieldFilters: {},
        rangeFilters: {},
      };

      expect(getActiveFilterCount(filters)).toBe(1);
    });

    it("should count date range as one filter when only startDate present", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: "2024-01-01",
        endDate: null,
        fieldFilters: {},
        rangeFilters: {},
      };

      expect(getActiveFilterCount(filters)).toBe(1);
    });

    it("should count date range as one filter when only endDate present", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: "2024-12-31",
        fieldFilters: {},
        rangeFilters: {},
      };

      expect(getActiveFilterCount(filters)).toBe(1);
    });

    it("should not count empty string dates", () => {
      const filters: FilterState = { datasets: [], startDate: "", endDate: "", fieldFilters: {}, rangeFilters: {} };

      expect(getActiveFilterCount(filters)).toBe(0);
    });

    it("should count field filter values", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: { category: ["A", "B"], type: ["X"] },
        rangeFilters: {},
      };

      // fieldFilters: 2 + 1 = 3
      expect(getActiveFilterCount(filters)).toBe(3);
    });

    it("should count date range but not datasets", () => {
      const filters: FilterState = {
        datasets: ["dataset-1", "dataset-2"],
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        fieldFilters: {},
        rangeFilters: {},
      };

      // date range (1) only — datasets excluded
      expect(getActiveFilterCount(filters)).toBe(1);
    });

    it("should count field filters and date range but not datasets", () => {
      const filters: FilterState = {
        datasets: ["dataset-1"],
        startDate: "2024-01-01",
        endDate: null,
        fieldFilters: { category: ["A"] },
        rangeFilters: {},
      };

      // date range (1) + fieldFilter (1) = 2
      expect(getActiveFilterCount(filters)).toBe(2);
    });

    it("should count each range filter with a min or max bound", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: {},
        rangeFilters: { price: { min: 10, max: null }, size: { min: null, max: 5 } },
      };

      // two bounded ranges = 2
      expect(getActiveFilterCount(filters)).toBe(2);
    });

    it("should not count a range filter whose bounds are both null", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: {},
        rangeFilters: { price: { min: null, max: null } },
      };

      expect(getActiveFilterCount(filters)).toBe(0);
    });
  });

  describe("hasActiveFilters", () => {
    it("should return false for empty filters", () => {
      const filters: FilterState = { datasets: [], startDate: null, endDate: null, fieldFilters: {}, rangeFilters: {} };

      expect(hasActiveFilters(filters)).toBe(false);
    });

    it("should return false for empty string values", () => {
      const filters: FilterState = { datasets: [], startDate: "", endDate: "", fieldFilters: {}, rangeFilters: {} };

      expect(hasActiveFilters(filters)).toBe(false);
    });

    it("should return false when only datasets are set (datasets are selection, not filters)", () => {
      const filters: FilterState = {
        datasets: ["dataset-1"],
        startDate: null,
        endDate: null,
        fieldFilters: {},
        rangeFilters: {},
      };

      expect(hasActiveFilters(filters)).toBe(false);
    });

    it("should return true when startDate is set", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: "2024-01-01",
        endDate: null,
        fieldFilters: {},
        rangeFilters: {},
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true when endDate is set", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: "2024-12-31",
        fieldFilters: {},
        rangeFilters: {},
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true when multiple filters are set", () => {
      const filters: FilterState = {
        datasets: ["dataset-1", "dataset-2"],
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        fieldFilters: {},
        rangeFilters: {},
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true even with partial date range", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: "2024-01-01",
        endDate: "",
        fieldFilters: {},
        rangeFilters: {},
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true when fieldFilters have values", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: { category: ["A"] },
        rangeFilters: {},
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return false when fieldFilters are empty arrays", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: { category: [] },
        rangeFilters: {},
      };

      expect(hasActiveFilters(filters)).toBe(false);
    });

    it("should return true when a range filter has a bound", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: {},
        rangeFilters: { price: { min: 10, max: null } },
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return false when a range filter has no bounds", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: {},
        rangeFilters: { price: { min: null, max: null } },
      };

      expect(hasActiveFilters(filters)).toBe(false);
    });
  });

  describe("clearAllFilters", () => {
    it("should clear dates and field filters but preserve datasets", () => {
      const filters: FilterState = {
        datasets: ["dataset-1", "dataset-2"],
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        fieldFilters: { category: ["A"] },
        rangeFilters: {},
      };
      const result = clearAllFilters(filters);

      expect(result).toEqual({
        datasets: ["dataset-1", "dataset-2"],
        startDate: null,
        endDate: null,
        fieldFilters: {},
        rangeFilters: {},
      });
    });

    it("should return fresh object each time", () => {
      const filters: FilterState = {
        datasets: ["1"],
        startDate: null,
        endDate: null,
        fieldFilters: {},
        rangeFilters: {},
      };
      const result1 = clearAllFilters(filters);
      const result2 = clearAllFilters(filters);

      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });
  });
});
