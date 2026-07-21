/**
 * Unit tests for H3 hover fetch param building.
 *
 * Verifies hover requests inherit only the supported page filters and do not
 * depend on global browser state.
 *
 * @module
 * @category Tests
 */
import { cellToBoundary } from "h3-js";
import { describe, expect, it } from "vitest";

import type { ClusterFeature } from "@/components/maps/clustered-map";
import { buildH3HexData, buildHoverFetchParams, resolveParentCells } from "@/components/maps/clustered-map-hex-data";

describe("buildHoverFetchParams", () => {
  it("copies supported filter params and hover metadata", () => {
    const rf = JSON.stringify({ score: { min: 1, max: 10 } });
    const pageParams = new URLSearchParams(
      `catalog=7&datasets=10,11&startDate=2024-01-01&endDate=2024-12-31&ff=preview&rf=${encodeURIComponent(rf)}&ignored=value`
    );
    const parentCells = ["8928308280fffff", "8928308280bffff"];
    const bounds = { getNorth: () => 52.5, getSouth: () => 52.1, getEast: () => 13.7, getWest: () => 13.2 };
    const scope = { catalogIds: [3, 4], datasetIds: [21, 22] };

    const params = buildHoverFetchParams(pageParams, parentCells, 9.4, bounds, scope);

    expect(params.get("catalog")).toBe("7");
    expect(params.get("datasets")).toBe("10,11");
    expect(params.get("startDate")).toBe("2024-01-01");
    expect(params.get("endDate")).toBe("2024-12-31");
    expect(params.get("ff")).toBe("preview");
    expect(params.get("rf")).toBe(rf);
    expect(params.get("scopeCatalogs")).toBe("3,4");
    expect(params.get("scopeDatasets")).toBe("21,22");
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
    expect(params.has("scopeCatalogs")).toBe(false);
    expect(params.has("scopeDatasets")).toBe(false);
    expect(params.has("bounds")).toBe(false);
    expect(params.get("zoom")).toBe("4");
    expect(params.get("targetClusters")).toBe("100");
  });
});

describe("buildH3HexData antimeridian handling", () => {
  /** Res-5 cell straddling 180° near Antarctica; its raw boundary mixes +179.x and -179.x. */
  const STRADDLING_CELL = "85f385a3fffffff";
  /** Ordinary Berlin cell, nowhere near the dateline. */
  const BERLIN_CELL = "851f1d4bfffffff";

  const cluster = (id: string): ClusterFeature => ({
    type: "Feature",
    id,
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { type: "event-cluster", count: 3 },
  });

  const ringOf = (collection: GeoJSON.FeatureCollection, index: number): Array<[number, number]> =>
    (collection.features[index]!.geometry as GeoJSON.Polygon).coordinates[0] as Array<[number, number]>;

  it("keeps a dateline-straddling hexagon contiguous instead of spanning the globe", () => {
    // Guard the premise: h3-js really does hand back a wrapped boundary here.
    const rawLngs = cellToBoundary(STRADDLING_CELL).map(([, lng]) => lng);
    expect(Math.max(...rawLngs) - Math.min(...rawLngs)).toBeGreaterThan(180);

    const ring = ringOf(buildH3HexData("h3", [cluster(STRADDLING_CELL)]), 0);
    const lngs = ring.map(([lng]) => lng);

    // A hexagon is a fraction of a degree wide — before normalization this span
    // was ~360, which MapLibre drew as a band across the whole map.
    expect(Math.max(...lngs) - Math.min(...lngs)).toBeLessThan(1);
    // Vertices past the antimeridian stay unwrapped (>180); MapLibre wraps them.
    expect(Math.max(...lngs)).toBeGreaterThan(180);
    // Ring is still closed.
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("leaves hexagons away from the dateline untouched", () => {
    const ring = ringOf(buildH3HexData("h3", [cluster(BERLIN_CELL)]), 0);
    const raw = cellToBoundary(BERLIN_CELL).map(([lat, lng]) => [lng, lat]);

    expect(ring.slice(0, -1)).toEqual(raw);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });
});

describe("resolveParentCells", () => {
  it("accepts arrays and JSON arrays while ignoring invalid cell entries", () => {
    expect(resolveParentCells(["8928308280fffff", "", 12, "8928308280bffff"], "")).toEqual([
      "8928308280fffff",
      "8928308280bffff",
    ]);
    expect(resolveParentCells('["8928308280fffff",null,"8928308280bffff"]', "")).toEqual([
      "8928308280fffff",
      "8928308280bffff",
    ]);
  });

  it("does not treat malformed JSON or non-array JSON as source cells", () => {
    expect(resolveParentCells("{bad json", "")).toEqual([]);
    expect(resolveParentCells('"8928308280fffff"', "")).toEqual([]);
    expect(resolveParentCells('{"cell":"8928308280fffff"}', "")).toEqual([]);
  });

  it("falls back to a valid H3 cluster ID when no source cells are present", () => {
    expect(resolveParentCells(undefined, "8928308280fffff")).toEqual(["8928308280fffff"]);
    expect(resolveParentCells(undefined, "not-a-cell")).toEqual([]);
  });
});
