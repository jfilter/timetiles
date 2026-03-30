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
      const filters: FilterState = { datasets: [], startDate: null, endDate: null, fieldFilters: {} };

      expect(getActiveFilterCount(filters)).toBe(0);
    });

    it("should count each dataset separately", () => {
      const filters: FilterState = {
        datasets: ["dataset-1", "dataset-2", "dataset-3"],
        startDate: null,
        endDate: null,
        fieldFilters: {},
      };

      expect(getActiveFilterCount(filters)).toBe(3);
    });

    it("should count date range as one filter when both dates present", () => {
      const filters: FilterState = { datasets: [], startDate: "2024-01-01", endDate: "2024-12-31", fieldFilters: {} };

      expect(getActiveFilterCount(filters)).toBe(1);
    });

    it("should count date range as one filter when only startDate present", () => {
      const filters: FilterState = { datasets: [], startDate: "2024-01-01", endDate: null, fieldFilters: {} };

      expect(getActiveFilterCount(filters)).toBe(1);
    });

    it("should count date range as one filter when only endDate present", () => {
      const filters: FilterState = { datasets: [], startDate: null, endDate: "2024-12-31", fieldFilters: {} };

      expect(getActiveFilterCount(filters)).toBe(1);
    });

    it("should not count empty string dates", () => {
      const filters: FilterState = { datasets: [], startDate: "", endDate: "", fieldFilters: {} };

      expect(getActiveFilterCount(filters)).toBe(0);
    });

    it("should count field filter values", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: { category: ["A", "B"], type: ["X"] },
      };

      // fieldFilters: 2 + 1 = 3
      expect(getActiveFilterCount(filters)).toBe(3);
    });

    it("should count all filter types together", () => {
      const filters: FilterState = {
        datasets: ["dataset-1", "dataset-2"],
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        fieldFilters: {},
      };

      // datasets (2) + date range (1) = 3
      expect(getActiveFilterCount(filters)).toBe(3);
    });

    it("should handle mixed empty and non-empty values", () => {
      const filters: FilterState = {
        datasets: ["dataset-1"],
        startDate: "2024-01-01",
        endDate: null,
        fieldFilters: {},
      };

      // datasets (1) + date range (1) = 2
      expect(getActiveFilterCount(filters)).toBe(2);
    });
  });

  describe("hasActiveFilters", () => {
    it("should return false for empty filters", () => {
      const filters: FilterState = { datasets: [], startDate: null, endDate: null, fieldFilters: {} };

      expect(hasActiveFilters(filters)).toBe(false);
    });

    it("should return false for empty string values", () => {
      const filters: FilterState = { datasets: [], startDate: "", endDate: "", fieldFilters: {} };

      expect(hasActiveFilters(filters)).toBe(false);
    });

    it("should return true when datasets are set", () => {
      const filters: FilterState = { datasets: ["dataset-1"], startDate: null, endDate: null, fieldFilters: {} };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true when startDate is set", () => {
      const filters: FilterState = { datasets: [], startDate: "2024-01-01", endDate: null, fieldFilters: {} };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true when endDate is set", () => {
      const filters: FilterState = { datasets: [], startDate: null, endDate: "2024-12-31", fieldFilters: {} };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true when multiple filters are set", () => {
      const filters: FilterState = {
        datasets: ["dataset-1", "dataset-2"],
        startDate: "2024-01-01",
        endDate: "2024-12-31",
        fieldFilters: {},
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true even with partial date range", () => {
      const filters: FilterState = { datasets: [], startDate: "2024-01-01", endDate: "", fieldFilters: {} };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true when fieldFilters have values", () => {
      const filters: FilterState = { datasets: [], startDate: null, endDate: null, fieldFilters: { category: ["A"] } };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return false when fieldFilters are empty arrays", () => {
      const filters: FilterState = { datasets: [], startDate: null, endDate: null, fieldFilters: { category: [] } };

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
        };

        const result = removeFilter(filters, "datasets", "dataset-2");

        expect(result.datasets).toEqual(["dataset-1", "dataset-3"]);
      });

      it("should preserve other datasets when removing specific dataset", () => {
        const filters: FilterState = { datasets: ["dataset-1"], startDate: null, endDate: null, fieldFilters: {} };

        const result = removeFilter(filters, "datasets", "dataset-2");

        expect(result.datasets).toEqual(["dataset-1"]);
      });

      it("should not mutate original filter object", () => {
        const filters: FilterState = {
          datasets: ["dataset-1", "dataset-2"],
          startDate: null,
          endDate: null,
          fieldFilters: {},
        };

        const result = removeFilter(filters, "datasets", "dataset-1");

        expect(filters.datasets).toEqual(["dataset-1", "dataset-2"]);
        expect(result).not.toBe(filters);
      });
    });

    describe("startDate removal", () => {
      it("should remove startDate filter", () => {
        const filters: FilterState = { datasets: [], startDate: "2024-01-01", endDate: "2024-12-31", fieldFilters: {} };

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
        };

        const result = removeFilter(filters, "startDate");

        expect(result.datasets).toEqual(["dataset-1"]);
      });

      it("should not mutate original filter object", () => {
        const filters: FilterState = { datasets: [], startDate: "2024-01-01", endDate: null, fieldFilters: {} };

        const result = removeFilter(filters, "startDate");

        expect(filters.startDate).toBe("2024-01-01");
        expect(result).not.toBe(filters);
      });
    });

    describe("endDate removal", () => {
      it("should remove endDate filter", () => {
        const filters: FilterState = { datasets: [], startDate: "2024-01-01", endDate: "2024-12-31", fieldFilters: {} };

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
        };

        const result = removeFilter(filters, "endDate");

        expect(result.datasets).toEqual(["dataset-1"]);
      });

      it("should not mutate original filter object", () => {
        const filters: FilterState = { datasets: [], startDate: null, endDate: "2024-12-31", fieldFilters: {} };

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
      };

      const result = removeFilter(filters, "fieldFilters", "category:A");

      expect(result.fieldFilters).toEqual({ category: ["B"], type: ["X"] });
    });

    it("should remove entire field when last value removed", () => {
      const filters: FilterState = { datasets: [], startDate: null, endDate: null, fieldFilters: { category: ["A"] } };

      const result = removeFilter(filters, "fieldFilters", "category:A");

      expect(result.fieldFilters).toEqual({});
    });

    it("should clear all field values for a field path without colon", () => {
      const filters: FilterState = {
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: { category: ["A", "B"], type: ["X"] },
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
      };

      const result = removeFilter(filters, "datasets");

      expect(result.fieldFilters).toEqual({});
    });
  });

  describe("clearAllFilters", () => {
    it("should return empty filter state", () => {
      const result = clearAllFilters();

      expect(result).toEqual({ datasets: [], startDate: null, endDate: null, fieldFilters: {} });
    });

    it("should always return same structure", () => {
      const result1 = clearAllFilters();
      const result2 = clearAllFilters();

      expect(result1).toEqual(result2);
    });

    it("should return fresh object each time", () => {
      const result1 = clearAllFilters();
      const result2 = clearAllFilters();

      expect(result1).not.toBe(result2);
    });
  });
});
