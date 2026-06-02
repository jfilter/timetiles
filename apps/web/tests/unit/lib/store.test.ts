/**
 * Unit tests for store helper functions.
 *
 * Tests filter state management utilities including counting active filters,
 * checking filter presence, removing filters, and clearing all filters.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import type { FilterState } from "../../../lib/types/filter-state";
import { clearAllFilters, getActiveFilterCount, hasActiveFilters, removeFilter } from "../../../lib/types/filter-state";

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

  describe("removeFilter", () => {
    describe("datasets removal", () => {
      it("should remove all datasets when no value provided", () => {
        const filters: FilterState = {
          datasets: ["dataset-1", "dataset-2", "dataset-3"],
          startDate: null,
          endDate: null,
          fieldFilters: {},
          rangeFilters: {},
        };

        const result = removeFilter(filters, "datasets");

        expect(result.datasets).toEqual([]);
      });

      it("should remove all datasets when empty string provided", () => {
        const filters: FilterState = {
          datasets: ["dataset-1", "dataset-2"],
          startDate: null,
          endDate: null,
          fieldFilters: {},
          rangeFilters: {},
        };

        const result = removeFilter(filters, "datasets", "");

        expect(result.datasets).toEqual([]);
      });

      it("should remove specific dataset when value provided", () => {
        const filters: FilterState = {
          datasets: ["dataset-1", "dataset-2", "dataset-3"],
          startDate: null,
          endDate: null,
          fieldFilters: {},
          rangeFilters: {},
        };

        const result = removeFilter(filters, "datasets", "dataset-2");

        expect(result.datasets).toEqual(["dataset-1", "dataset-3"]);
      });

      it("should preserve other datasets when removing specific dataset", () => {
        const filters: FilterState = {
          datasets: ["dataset-1"],
          startDate: null,
          endDate: null,
          fieldFilters: {},
          rangeFilters: {},
        };

        const result = removeFilter(filters, "datasets", "dataset-2");

        expect(result.datasets).toEqual(["dataset-1"]);
      });

      it("should not mutate original filter object", () => {
        const filters: FilterState = {
          datasets: ["dataset-1", "dataset-2"],
          startDate: null,
          endDate: null,
          fieldFilters: {},
          rangeFilters: {},
        };

        const result = removeFilter(filters, "datasets", "dataset-1");

        expect(filters.datasets).toEqual(["dataset-1", "dataset-2"]);
        expect(result).not.toBe(filters);
      });
    });

    describe("startDate removal", () => {
      it("should remove startDate filter", () => {
        const filters: FilterState = {
          datasets: [],
          startDate: "2024-01-01",
          endDate: "2024-12-31",
          fieldFilters: {},
          rangeFilters: {},
        };

        const result = removeFilter(filters, "startDate");

        expect(result.startDate).toBeNull();
        expect(result.endDate).toBe("2024-12-31");
      });

      it("should preserve other filters when removing startDate", () => {
        const filters: FilterState = {
          datasets: ["dataset-1"],
          startDate: "2024-01-01",
          endDate: null,
          fieldFilters: {},
          rangeFilters: {},
        };

        const result = removeFilter(filters, "startDate");

        expect(result.datasets).toEqual(["dataset-1"]);
      });

      it("should not mutate original filter object", () => {
        const filters: FilterState = {
          datasets: [],
          startDate: "2024-01-01",
          endDate: null,
          fieldFilters: {},
          rangeFilters: {},
        };

        const result = removeFilter(filters, "startDate");

        expect(filters.startDate).toBe("2024-01-01");
        expect(result).not.toBe(filters);
      });
    });

    describe("endDate removal", () => {
      it("should remove endDate filter", () => {
        const filters: FilterState = {
          datasets: [],
          startDate: "2024-01-01",
          endDate: "2024-12-31",
          fieldFilters: {},
          rangeFilters: {},
        };

        const result = removeFilter(filters, "endDate");

        expect(result.endDate).toBeNull();
        expect(result.startDate).toBe("2024-01-01");
      });

      it("should preserve other filters when removing endDate", () => {
        const filters: FilterState = {
          datasets: ["dataset-1"],
          startDate: null,
          endDate: "2024-12-31",
          fieldFilters: {},
          rangeFilters: {},
        };

        const result = removeFilter(filters, "endDate");

        expect(result.datasets).toEqual(["dataset-1"]);
      });

      it("should not mutate original filter object", () => {
        const filters: FilterState = {
          datasets: [],
          startDate: null,
          endDate: "2024-12-31",
          fieldFilters: {},
          rangeFilters: {},
        };

        const result = removeFilter(filters, "endDate");

        expect(filters.endDate).toBe("2024-12-31");
        expect(result).not.toBe(filters);
      });
    });
  });

  describe("fieldFilters removal", () => {
    it("should remove specific field filter value with colon syntax", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: { category: ["A", "B"], type: ["X"] },
        rangeFilters: {},
      };

      const result = removeFilter(filters, "fieldFilters", "category:A");

      expect(result.fieldFilters).toEqual({ category: ["B"], type: ["X"] });
    });

    it("should remove entire field when last value removed", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: { category: ["A"] },
        rangeFilters: {},
      };

      const result = removeFilter(filters, "fieldFilters", "category:A");

      expect(result.fieldFilters).toEqual({});
    });

    it("should clear all field values for a field path without colon", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: { category: ["A", "B"], type: ["X"] },
        rangeFilters: {},
      };

      const result = removeFilter(filters, "fieldFilters", "category");

      expect(result.fieldFilters).toEqual({ type: ["X"] });
    });

    it("should clear all field filters when no value provided", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: { category: ["A"], type: ["X"] },
        rangeFilters: {},
      };

      const result = removeFilter(filters, "fieldFilters");

      expect(result.fieldFilters).toEqual({});
    });

    it("should also clear fieldFilters when removing datasets", () => {
      const filters: FilterState = {
        datasets: ["dataset-1"],
        startDate: null,
        endDate: null,
        fieldFilters: { category: ["A"] },
        rangeFilters: {},
      };

      const result = removeFilter(filters, "datasets");

      expect(result.fieldFilters).toEqual({});
    });
  });

  describe("rangeFilters removal", () => {
    const withRanges = (): FilterState => ({
      datasets: ["dataset-1"],
      startDate: null,
      endDate: null,
      fieldFilters: {},
      rangeFilters: { price: { min: 10, max: null }, size: { min: null, max: 5 } },
    });

    it("should remove a single range filter by field path", () => {
      const result = removeFilter(withRanges(), "rangeFilters", "price");
      expect(result.rangeFilters).toEqual({ size: { min: null, max: 5 } });
    });

    it("should clear all range filters when no value provided", () => {
      const result = removeFilter(withRanges(), "rangeFilters");
      expect(result.rangeFilters).toEqual({});
    });

    it("should also clear rangeFilters when removing datasets (single-dataset/format specific)", () => {
      const result = removeFilter(withRanges(), "datasets");
      expect(result.rangeFilters).toEqual({});
    });

    it("should not mutate the original filter object", () => {
      const filters = withRanges();
      removeFilter(filters, "rangeFilters", "price");
      expect(filters.rangeFilters).toEqual({ price: { min: 10, max: null }, size: { min: null, max: 5 } });
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
