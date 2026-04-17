/**
 * Unit tests for H3 hover fetch param building.
 *
 * Verifies hover requests inherit only the supported page filters and do not
 * depend on global browser state.
 *
 * @module
 * @category Tests
 */
import { describe, expect, it } from "vitest";

import { buildHoverFetchParams } from "@/components/maps/clustered-map-hex-data";

describe("buildHoverFetchParams", () => {
  it("copies supported filter params and hover metadata", () => {
    const pageParams = new URLSearchParams(
      "catalog=7&datasets=10,11&startDate=2024-01-01&endDate=2024-12-31&ff=preview&ignored=value"
    );
    const parentCells = ["8928308280fffff", "8928308280bffff"];
    const bounds = { getNorth: () => 52.5, getSouth: () => 52.1, getEast: () => 13.7, getWest: () => 13.2 };

    const params = buildHoverFetchParams(pageParams, parentCells, 9.4, bounds);

    expect(params.get("catalog")).toBe("7");
    expect(params.get("datasets")).toBe("10,11");
    expect(params.get("startDate")).toBe("2024-01-01");
    expect(params.get("endDate")).toBe("2024-12-31");
    expect(params.get("ff")).toBe("preview");
    expect(params.has("ignored")).toBe(false);
    expect(params.get("parentCells")).toBe(parentCells.join(","));
    expect(params.get("zoom")).toBe("9");
    expect(params.get("targetClusters")).toBe("100");
    expect(params.get("bounds")).toBe(JSON.stringify({ north: 52.5, south: 52.1, east: 13.7, west: 13.2 }));
  });

  it("omits optional filters and bounds when absent", () => {
    const params = buildHoverFetchParams(new URLSearchParams("ignored=value"), ["8928308280fffff"], 4.1, null);

    expect(params.has("catalog")).toBe(false);
    expect(params.has("datasets")).toBe(false);
    expect(params.has("bounds")).toBe(false);
    expect(params.get("zoom")).toBe("4");
    expect(params.get("targetClusters")).toBe("100");
  });
});
