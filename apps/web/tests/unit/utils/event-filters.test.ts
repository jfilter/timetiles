/**
 * Unit tests for canonical event filter builder.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { buildCanonicalFilters, normalizeEndDate } from "@/lib/filters/build-canonical-filters";

describe("buildCanonicalFilters", () => {
  it("normalizes date-only end dates", () => {
    const filters = buildCanonicalFilters({
      parameters: { endDate: "2024-03-31", ff: {} },
      accessibleCatalogIds: [1, 2],
    });

    expect(filters.endDate).toBe("2024-03-31T23:59:59.999Z");
  });

  it("passes through dataset ids directly", () => {
    const filters = buildCanonicalFilters({ parameters: { datasets: [10, 20], ff: {} }, accessibleCatalogIds: [1, 2] });

    expect(filters.datasets).toEqual([10, 20]);
  });

  it("treats undefined catalog as no catalog filter", () => {
    const filters = buildCanonicalFilters({ parameters: { ff: {} }, accessibleCatalogIds: [1, 2] });

    expect(filters.catalogIds).toEqual([1, 2]);
    expect(filters.denyResults).toBeUndefined();
    expect(filters.catalogId).toBeUndefined();
  });

  it("sets catalogId when catalog is accessible", () => {
    const filters = buildCanonicalFilters({ parameters: { catalog: 1, ff: {} }, accessibleCatalogIds: [1, 2] });

    expect(filters.catalogId).toBe(1);
    expect(filters.denyResults).toBeUndefined();
  });

  it("denies results when catalog is inaccessible", () => {
    const filters = buildCanonicalFilters({ parameters: { catalog: 999, ff: {} }, accessibleCatalogIds: [1, 2] });

    expect(filters.denyResults).toBe(true);
    expect(filters.catalogId).toBeUndefined();
  });

  it("reads bounds from parameters in canonical format", () => {
    const filters = buildCanonicalFilters({
      parameters: { bounds: { north: 37.8, south: 37.7, east: -122.4, west: -122.5 }, ff: {} },
      accessibleCatalogIds: [1],
    });

    expect(filters.bounds).toEqual({ north: 37.8, south: 37.7, east: -122.4, west: -122.5 });
  });

  it("passes valid field filters from ff", () => {
    const filters = buildCanonicalFilters({ parameters: { ff: { category: ["A", "B"] } }, accessibleCatalogIds: [1] });

    expect(filters.fieldFilters).toEqual({ category: ["A", "B"] });
  });

  it("strips invalid field filter keys", () => {
    const longKey = "a".repeat(100);
    const filters = buildCanonicalFilters({
      parameters: { ff: { valid_key: ["A"], "invalid key with spaces": ["B"], [longKey]: ["C"] } },
      accessibleCatalogIds: [1],
    });

    expect(filters.fieldFilters).toEqual({ valid_key: ["A"] });
  });

  describe("scope constraints", () => {
    it("leaves filters unchanged when no scope params are provided", () => {
      const filters = buildCanonicalFilters({
        parameters: { catalog: 1, datasets: [10, 20], ff: {} },
        accessibleCatalogIds: [1, 2],
      });

      expect(filters.catalogId).toBe(1);
      expect(filters.datasets).toEqual([10, 20]);
      expect(filters.denyResults).toBeUndefined();
    });

    it("passes through catalogId when it is within scopeCatalogs", () => {
      const filters = buildCanonicalFilters({
        parameters: { catalog: 1, scopeCatalogs: [1, 3], ff: {} },
        accessibleCatalogIds: [1, 2],
      });

      expect(filters.catalogId).toBe(1);
      expect(filters.denyResults).toBeUndefined();
    });

    it("denies results when catalogId is not within scopeCatalogs", () => {
      const filters = buildCanonicalFilters({
        parameters: { catalog: 2, scopeCatalogs: [1, 3], ff: {} },
        accessibleCatalogIds: [1, 2],
      });

      expect(filters.denyResults).toBe(true);
    });

    it("intersects catalogIds with scopeCatalogs", () => {
      const filters = buildCanonicalFilters({
        parameters: { scopeCatalogs: [2, 3], ff: {} },
        accessibleCatalogIds: [1, 2, 3, 4],
      });

      expect(filters.catalogIds).toEqual([2, 3]);
      expect(filters.denyResults).toBeUndefined();
    });

    it("denies results when catalogIds and scopeCatalogs have empty intersection", () => {
      const filters = buildCanonicalFilters({
        parameters: { scopeCatalogs: [5, 6], ff: {} },
        accessibleCatalogIds: [1, 2],
      });

      expect(filters.denyResults).toBe(true);
    });

    it("intersects user datasets with scopeDatasets", () => {
      const filters = buildCanonicalFilters({
        parameters: { datasets: [10, 20, 30], scopeDatasets: [20, 30, 40], ff: {} },
        accessibleCatalogIds: [1],
      });

      expect(filters.datasets).toEqual([20, 30]);
      expect(filters.denyResults).toBeUndefined();
    });

    it("denies results when user datasets and scopeDatasets have empty intersection", () => {
      const filters = buildCanonicalFilters({
        parameters: { datasets: [10, 20], scopeDatasets: [30, 40], ff: {} },
        accessibleCatalogIds: [1],
      });

      expect(filters.denyResults).toBe(true);
    });

    it("uses scopeDatasets directly when no user datasets are selected", () => {
      const filters = buildCanonicalFilters({
        parameters: { scopeDatasets: [30, 40], ff: {} },
        accessibleCatalogIds: [1],
      });

      expect(filters.datasets).toEqual([30, 40]);
      expect(filters.denyResults).toBeUndefined();
    });

    it("applies both scopeCatalogs and scopeDatasets together", () => {
      const filters = buildCanonicalFilters({
        parameters: { datasets: [10, 20], scopeCatalogs: [2, 3], scopeDatasets: [20, 30], ff: {} },
        accessibleCatalogIds: [1, 2, 3, 4],
      });

      expect(filters.catalogIds).toEqual([2, 3]);
      expect(filters.datasets).toEqual([20]);
      expect(filters.denyResults).toBeUndefined();
    });
  });
});

describe("normalizeEndDate", () => {
  it("returns null for null input", () => {
    expect(normalizeEndDate(null)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(normalizeEndDate("")).toBeNull();
  });

  it("appends end-of-day time to date-only string", () => {
    expect(normalizeEndDate("2024-12-31")).toBe("2024-12-31T23:59:59.999Z");
  });

  it("passes through dates that already include time", () => {
    expect(normalizeEndDate("2024-12-31T12:00:00Z")).toBe("2024-12-31T12:00:00Z");
  });
});
