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

import { getActiveFilterCount, hasActiveFilters, removeFilter, clearAllFilters, FilterState } from "../../../lib/store";

describe("Store Helper Functions", () => {
  describe("getActiveFilterCount", () => {
    it("should return 0 for empty filters", () => {
      const filters: FilterState = {
        catalog: null,
        datasets: [],
        startDate: null,
        endDate: null,
      };

      expect(getActiveFilterCount(filters)).toBe(0);
    });

    it("should count catalog filter", () => {
      const filters: FilterState = {
        catalog: "catalog-1",
        datasets: [],
        startDate: null,
        endDate: null,
      };

      expect(getActiveFilterCount(filters)).toBe(1);
    });

    it("should not count empty string catalog", () => {
      const filters: FilterState = {
        catalog: "",
        datasets: [],
        startDate: null,
        endDate: null,
      };

      expect(getActiveFilterCount(filters)).toBe(0);
    });

    it("should count each dataset separately", () => {
      const filters: FilterState = {
        catalog: null,
        datasets: ["dataset-1", "dataset-2", "dataset-3"],
        startDate: null,
        endDate: null,
      };

      expect(getActiveFilterCount(filters)).toBe(3);
    });

    it("should count date range as one filter when both dates present", () => {
      const filters: FilterState = {
        catalog: null,
        datasets: [],
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      expect(getActiveFilterCount(filters)).toBe(1);
    });

    it("should count date range as one filter when only startDate present", () => {
      const filters: FilterState = {
        catalog: null,
        datasets: [],
        startDate: "2024-01-01",
        endDate: null,
      };

      expect(getActiveFilterCount(filters)).toBe(1);
    });

    it("should count date range as one filter when only endDate present", () => {
      const filters: FilterState = {
        catalog: null,
        datasets: [],
        startDate: null,
        endDate: "2024-12-31",
      };

      expect(getActiveFilterCount(filters)).toBe(1);
    });

    it("should not count empty string dates", () => {
      const filters: FilterState = {
        catalog: null,
        datasets: [],
        startDate: "",
        endDate: "",
      };

      expect(getActiveFilterCount(filters)).toBe(0);
    });

    it("should count all filter types together", () => {
      const filters: FilterState = {
        catalog: "catalog-1",
        datasets: ["dataset-1", "dataset-2"],
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      // catalog (1) + datasets (2) + date range (1) = 4
      expect(getActiveFilterCount(filters)).toBe(4);
    });

    it("should handle mixed empty and non-empty values", () => {
      const filters: FilterState = {
        catalog: "",
        datasets: ["dataset-1"],
        startDate: "2024-01-01",
        endDate: null,
      };

      // datasets (1) + date range (1) = 2
      expect(getActiveFilterCount(filters)).toBe(2);
    });
  });

  describe("hasActiveFilters", () => {
    it("should return false for empty filters", () => {
      const filters: FilterState = {
        catalog: null,
        datasets: [],
        startDate: null,
        endDate: null,
      };

      expect(hasActiveFilters(filters)).toBe(false);
    });

    it("should return false for empty string values", () => {
      const filters: FilterState = {
        catalog: "",
        datasets: [],
        startDate: "",
        endDate: "",
      };

      expect(hasActiveFilters(filters)).toBe(false);
    });

    it("should return true when catalog is set", () => {
      const filters: FilterState = {
        catalog: "catalog-1",
        datasets: [],
        startDate: null,
        endDate: null,
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true when datasets are set", () => {
      const filters: FilterState = {
        catalog: null,
        datasets: ["dataset-1"],
        startDate: null,
        endDate: null,
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true when startDate is set", () => {
      const filters: FilterState = {
        catalog: null,
        datasets: [],
        startDate: "2024-01-01",
        endDate: null,
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true when endDate is set", () => {
      const filters: FilterState = {
        catalog: null,
        datasets: [],
        startDate: null,
        endDate: "2024-12-31",
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true when multiple filters are set", () => {
      const filters: FilterState = {
        catalog: "catalog-1",
        datasets: ["dataset-1", "dataset-2"],
        startDate: "2024-01-01",
        endDate: "2024-12-31",
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });

    it("should return true even with partial date range", () => {
      const filters: FilterState = {
        catalog: null,
        datasets: [],
        startDate: "2024-01-01",
        endDate: "",
      };

      expect(hasActiveFilters(filters)).toBe(true);
    });
  });

  describe("removeFilter", () => {
    describe("catalog removal", () => {
      it("should remove catalog filter", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: [],
          startDate: null,
          endDate: null,
        };

        const result = removeFilter(filters, "catalog");

        expect(result.catalog).toBeNull();
      });

      it("should also clear datasets when removing catalog", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: ["dataset-1", "dataset-2"],
          startDate: null,
          endDate: null,
        };

        const result = removeFilter(filters, "catalog");

        expect(result.catalog).toBeNull();
        expect(result.datasets).toEqual([]);
      });

      it("should preserve date filters when removing catalog", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: [],
          startDate: "2024-01-01",
          endDate: "2024-12-31",
        };

        const result = removeFilter(filters, "catalog");

        expect(result.startDate).toBe("2024-01-01");
        expect(result.endDate).toBe("2024-12-31");
      });

      it("should not mutate original filter object", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: ["dataset-1"],
          startDate: null,
          endDate: null,
        };

        const result = removeFilter(filters, "catalog");

        expect(filters.catalog).toBe("catalog-1");
        expect(filters.datasets).toEqual(["dataset-1"]);
        expect(result).not.toBe(filters);
      });
    });

    describe("datasets removal", () => {
      it("should remove all datasets when no value provided", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: ["dataset-1", "dataset-2", "dataset-3"],
          startDate: null,
          endDate: null,
        };

        const result = removeFilter(filters, "datasets");

        expect(result.datasets).toEqual([]);
      });

      it("should remove all datasets when empty string provided", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: ["dataset-1", "dataset-2"],
          startDate: null,
          endDate: null,
        };

        const result = removeFilter(filters, "datasets", "");

        expect(result.datasets).toEqual([]);
      });

      it("should remove specific dataset when value provided", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: ["dataset-1", "dataset-2", "dataset-3"],
          startDate: null,
          endDate: null,
        };

        const result = removeFilter(filters, "datasets", "dataset-2");

        expect(result.datasets).toEqual(["dataset-1", "dataset-3"]);
      });

      it("should preserve other datasets when removing specific dataset", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: ["dataset-1"],
          startDate: null,
          endDate: null,
        };

        const result = removeFilter(filters, "datasets", "dataset-2");

        expect(result.datasets).toEqual(["dataset-1"]);
      });

      it("should preserve catalog when removing datasets", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: ["dataset-1", "dataset-2"],
          startDate: null,
          endDate: null,
        };

        const result = removeFilter(filters, "datasets");

        expect(result.catalog).toBe("catalog-1");
      });

      it("should not mutate original filter object", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: ["dataset-1", "dataset-2"],
          startDate: null,
          endDate: null,
        };

        const result = removeFilter(filters, "datasets", "dataset-1");

        expect(filters.datasets).toEqual(["dataset-1", "dataset-2"]);
        expect(result).not.toBe(filters);
      });
    });

    describe("startDate removal", () => {
      it("should remove startDate filter", () => {
        const filters: FilterState = {
          catalog: null,
          datasets: [],
          startDate: "2024-01-01",
          endDate: "2024-12-31",
        };

        const result = removeFilter(filters, "startDate");

        expect(result.startDate).toBeNull();
        expect(result.endDate).toBe("2024-12-31");
      });

      it("should preserve other filters when removing startDate", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: ["dataset-1"],
          startDate: "2024-01-01",
          endDate: null,
        };

        const result = removeFilter(filters, "startDate");

        expect(result.catalog).toBe("catalog-1");
        expect(result.datasets).toEqual(["dataset-1"]);
      });

      it("should not mutate original filter object", () => {
        const filters: FilterState = {
          catalog: null,
          datasets: [],
          startDate: "2024-01-01",
          endDate: null,
        };

        const result = removeFilter(filters, "startDate");

        expect(filters.startDate).toBe("2024-01-01");
        expect(result).not.toBe(filters);
      });
    });

    describe("endDate removal", () => {
      it("should remove endDate filter", () => {
        const filters: FilterState = {
          catalog: null,
          datasets: [],
          startDate: "2024-01-01",
          endDate: "2024-12-31",
        };

        const result = removeFilter(filters, "endDate");

        expect(result.endDate).toBeNull();
        expect(result.startDate).toBe("2024-01-01");
      });

      it("should preserve other filters when removing endDate", () => {
        const filters: FilterState = {
          catalog: "catalog-1",
          datasets: ["dataset-1"],
          startDate: null,
          endDate: "2024-12-31",
        };

        const result = removeFilter(filters, "endDate");

        expect(result.catalog).toBe("catalog-1");
        expect(result.datasets).toEqual(["dataset-1"]);
      });

      it("should not mutate original filter object", () => {
        const filters: FilterState = {
          catalog: null,
          datasets: [],
          startDate: null,
          endDate: "2024-12-31",
        };

        const result = removeFilter(filters, "endDate");

        expect(filters.endDate).toBe("2024-12-31");
        expect(result).not.toBe(filters);
      });
    });
  });

  describe("clearAllFilters", () => {
    it("should return empty filter state", () => {
      const result = clearAllFilters();

      expect(result).toEqual({
        catalog: null,
        datasets: [],
        startDate: null,
        endDate: null,
      });
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
