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
});
