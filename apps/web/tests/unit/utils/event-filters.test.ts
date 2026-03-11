/**
 * Unit tests for event filter builders.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { buildEventFilters } from "@/lib/utils/event-filters";

describe("event-filters", () => {
  it("normalizes date-only end dates in buildEventFilters", () => {
    const filters = buildEventFilters({ parameters: { endDate: "2024-03-31", ff: {} }, accessibleCatalogIds: [1, 2] });

    expect(filters.endDate).toBe("2024-03-31T23:59:59.999Z");
  });

  it("passes through dataset ids directly", () => {
    const filters = buildEventFilters({ parameters: { datasets: [10, 20], ff: {} }, accessibleCatalogIds: [1, 2] });

    expect(filters.datasets).toEqual([10, 20]);
  });

  it("treats undefined catalog as no catalog filter", () => {
    const filters = buildEventFilters({ parameters: { ff: {} }, accessibleCatalogIds: [1, 2] });

    expect(filters.catalogIds).toEqual([1, 2]);
    expect(filters).not.toHaveProperty("denyAccess", true);
    expect(filters.catalogId).toBeUndefined();
  });

  it("sets catalogId when catalog is accessible", () => {
    const filters = buildEventFilters({ parameters: { catalog: 1, ff: {} }, accessibleCatalogIds: [1, 2] });

    expect(filters.catalogId).toBe(1);
    expect(filters.denyResults).toBeUndefined();
  });

  it("denies results when catalog is inaccessible", () => {
    const filters = buildEventFilters({ parameters: { catalog: 999, ff: {} }, accessibleCatalogIds: [1, 2] });

    expect(filters.denyResults).toBe(true);
    expect(filters.catalogId).toBeUndefined();
  });

  it("reads bounds from parameters", () => {
    const filters = buildEventFilters({
      parameters: { bounds: { north: 37.8, south: 37.7, east: -122.4, west: -122.5 }, ff: {} },
      accessibleCatalogIds: [1],
    });

    expect(filters.bounds).toEqual({ minLng: -122.5, maxLng: -122.4, minLat: 37.7, maxLat: 37.8 });
  });

  it("passes field filters from ff", () => {
    const filters = buildEventFilters({ parameters: { ff: { category: ["A", "B"] } }, accessibleCatalogIds: [1] });

    expect(filters.fieldFilters).toEqual({ category: ["A", "B"] });
  });
});
