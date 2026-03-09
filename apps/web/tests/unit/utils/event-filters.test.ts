/**
 * Unit tests for event filter builders.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { buildEventFilters, buildMapClusterFilters } from "@/lib/utils/event-filters";

describe("event-filters", () => {
  it("normalizes date-only end dates in buildEventFilters", () => {
    const filters = buildEventFilters({
      parameters: {
        catalog: null,
        datasets: [],
        startDate: null,
        endDate: "2024-03-31",
        fieldFilters: {},
      },
      accessibleCatalogIds: [1, 2],
      bounds: null,
    });

    expect(filters.endDate).toBe("2024-03-31T23:59:59.999Z");
  });

  it("filters invalid dataset ids in buildEventFilters", () => {
    const filters = buildEventFilters({
      parameters: {
        catalog: null,
        datasets: ["10", "abc", "20"],
        startDate: null,
        endDate: null,
        fieldFilters: {},
      },
      accessibleCatalogIds: [1, 2],
      bounds: null,
    });

    expect(filters.datasets).toEqual([10, 20]);
  });

  it("returns no results when all dataset ids are invalid in buildEventFilters", () => {
    const filters = buildEventFilters({
      parameters: {
        catalog: null,
        datasets: ["abc", "def"],
        startDate: null,
        endDate: null,
        fieldFilters: {},
      },
      accessibleCatalogIds: [1, 2],
      bounds: null,
    });

    expect(filters.denyResults).toBe(true);
    expect(filters.datasets).toBeUndefined();
  });

  it("normalizes date-only end dates in buildMapClusterFilters", () => {
    const filters = buildMapClusterFilters(
      {
        catalog: null,
        datasets: [],
        startDate: null,
        endDate: "2024-03-31",
        fieldFilters: {},
      },
      [1, 2]
    );

    expect(filters.endDate).toBe("2024-03-31T23:59:59.999Z");
  });

  it("treats an empty catalog as no catalog filter in buildMapClusterFilters", () => {
    const filters = buildMapClusterFilters(
      {
        catalog: "",
        datasets: [],
        startDate: null,
        endDate: null,
        fieldFilters: {},
      },
      [1, 2]
    );

    expect(filters).toMatchObject({
      accessibleCatalogIds: [1, 2],
    });
    expect(filters).not.toHaveProperty("denyAccess", true);
    expect(filters).not.toHaveProperty("catalog");
  });

  it("filters invalid dataset ids in buildMapClusterFilters", () => {
    const filters = buildMapClusterFilters(
      {
        catalog: null,
        datasets: ["10", "abc", "20"],
        startDate: null,
        endDate: null,
        fieldFilters: {},
      },
      [1, 2]
    );

    expect(filters.datasets).toEqual([10, 20]);
  });

  it("returns no results when all dataset ids are invalid in buildMapClusterFilters", () => {
    const filters = buildMapClusterFilters(
      {
        catalog: null,
        datasets: ["abc", "def"],
        startDate: null,
        endDate: null,
        fieldFilters: {},
      },
      [1, 2]
    );

    expect(filters.denyResults).toBe(true);
    expect(filters.datasets).toBeUndefined();
  });
});
