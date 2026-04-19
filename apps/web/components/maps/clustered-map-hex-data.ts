/**
 * H3 hex polygon data builders for ClusteredMap.
 *
 * Pure functions that convert H3 cell IDs to GeoJSON polygon features
 * for rendering hexagon overlays, hover effects, and focus modes.
 *
 * @module
 * @category Components
 */

import { cellToBoundary, isValidCell } from "h3-js";

import type { ViewScope } from "@/lib/utils/event-params";

import type { ClusterFeature } from "./clustered-map";

type HoverFilterSearchParams = Pick<URLSearchParams, "get">;

/** Stable empty feature collection — reuse for memoization-friendly empty returns. */
export const EMPTY_FEATURE_COLLECTION: GeoJSON.FeatureCollection = { type: "FeatureCollection", features: [] };

/**
 * Resolve parent cells from a cluster feature's sourceCells property.
 * Handles both JSON-encoded strings and arrays, with fallback to the cluster ID.
 */
export const resolveParentCells = (rawSourceCells: unknown, clusterId: string): string[] => {
  let parentCells: string[] = [];
  if (typeof rawSourceCells === "string") {
    try {
      parentCells = JSON.parse(rawSourceCells) as string[];
    } catch {
      /* use default */
    }
  } else if (Array.isArray(rawSourceCells)) {
    parentCells = rawSourceCells as string[];
  }
  if (parentCells.length === 0 && clusterId.length > 5) {
    try {
      if (isValidCell(clusterId)) parentCells = [clusterId];
    } catch {
      /* skip */
    }
  }
  return parentCells;
};

/**
 * Build URL search params for the hover child-cells API request,
 * inheriting relevant filters from the current page search params.
 */
export const buildHoverFetchParams = (
  pageParams: HoverFilterSearchParams,
  parentCells: string[],
  currentZoom: number,
  mapBounds: { getNorth: () => number; getSouth: () => number; getEast: () => number; getWest: () => number } | null,
  scope?: ViewScope
): URLSearchParams => {
  const params = new URLSearchParams();
  for (const key of ["catalog", "datasets", "startDate", "endDate", "ff"]) {
    const val = pageParams.get(key);
    if (val) params.set(key, val);
  }
  if (scope?.catalogIds?.length) {
    params.set("scopeCatalogs", scope.catalogIds.join(","));
  }
  if (scope?.datasetIds?.length) {
    params.set("scopeDatasets", scope.datasetIds.join(","));
  }
  params.set("parentCells", parentCells.join(","));
  params.set("zoom", String(Math.round(currentZoom)));
  params.set("targetClusters", "100");
  if (mapBounds) {
    params.set(
      "bounds",
      JSON.stringify({
        north: mapBounds.getNorth(),
        south: mapBounds.getSouth(),
        east: mapBounds.getEast(),
        west: mapBounds.getWest(),
      })
    );
  }
  return params;
};

/** Convert an H3 cell boundary to a GeoJSON-compatible [lng, lat] ring. */
const cellToGeoJsonRing = (cellId: string): Array<[number, number]> => {
  const boundary = cellToBoundary(cellId);
  const coords = boundary.map(([lat, lng]) => [lng, lat] as [number, number]);
  if (coords.length > 0) coords.push(coords[0]!);
  return coords;
};

/** Graham scan convex hull for [lng, lat] points. */
const convexHull = (points: Array<[number, number]>): Array<[number, number]> => {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length <= 2) return pts;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
};

/** Check if an ID string is a valid H3 cell with length > 5. */
const isLongValidCell = (id: string): boolean => {
  try {
    return id.length > 5 && isValidCell(id);
  } catch {
    return false;
  }
};

/** Build hex polygon GeoJSON from animated cluster features (H3 algorithm). */
export const buildH3HexData = (algorithm: string, animatedClusters: ClusterFeature[]): GeoJSON.FeatureCollection => {
  if (algorithm !== "h3") return EMPTY_FEATURE_COLLECTION;
  const hexFeatures = animatedClusters
    .filter((f) => isLongValidCell(String(f.id ?? "")))
    .map((f) => {
      const coords = cellToGeoJsonRing(String(f.id ?? ""));
      return {
        type: "Feature" as const,
        properties: { count: f.properties.count ?? 1 },
        geometry: { type: "Polygon" as const, coordinates: [coords] },
      };
    });
  return { type: "FeatureCollection", features: hexFeatures };
};

/** Build merge group outline GeoJSON (convex hull around same-sourceCells clusters). */
export const buildMergeGroupData = (
  algorithm: string,
  animatedClusters: ClusterFeature[]
): GeoJSON.FeatureCollection => {
  if (algorithm !== "h3") return EMPTY_FEATURE_COLLECTION;
  const groups = new Map<string, Array<[number, number]>>();
  for (const f of animatedClusters) {
    const sc = f.properties.sourceCells;
    if (!sc || !Array.isArray(sc) || sc.length < 2) continue;
    const key = [...sc].sort((a, b) => String(a).localeCompare(String(b))).join(",");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(f.geometry.coordinates);
  }
  const features: GeoJSON.Feature[] = [];
  for (const [, points] of groups) {
    if (points.length < 2) continue;
    const hull = convexHull(points);
    if (hull.length >= 3) {
      hull.push(hull[0]!);
      features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [hull] } });
    }
  }
  return { type: "FeatureCollection", features };
};

/** Build hex polygon GeoJSON for focused cluster children. */
export const buildFocusHexData = (
  focusedCluster: unknown,
  algorithm: string,
  clusterChildren: ClusterFeature[] | null | undefined
): GeoJSON.FeatureCollection => {
  if (!focusedCluster || algorithm !== "h3" || !clusterChildren || clusterChildren.length === 0) {
    return EMPTY_FEATURE_COLLECTION;
  }
  const features: GeoJSON.Feature[] = [];
  for (const child of clusterChildren) {
    const childClusterId = String(child.properties.clusterId ?? child.id ?? "");
    if (!isLongValidCell(childClusterId)) continue;
    const coords = cellToGeoJsonRing(childClusterId);
    features.push({
      type: "Feature",
      properties: { intensity: 0.5, count: child.properties.count ?? 1 },
      geometry: { type: "Polygon", coordinates: [coords] },
    });
  }
  return { type: "FeatureCollection", features };
};

/** Build sub-cell heatmap hex GeoJSON for focus mode. */
export const buildFocusSubcellHexData = (
  focusedCluster: unknown,
  clusterChildren: ClusterFeature[] | null | undefined
): GeoJSON.FeatureCollection => {
  if (!focusedCluster || !clusterChildren || clusterChildren.length === 0) {
    return EMPTY_FEATURE_COLLECTION;
  }
  const hexFeatures = clusterChildren
    .filter((f) => isLongValidCell(String(f.id ?? "")))
    .map((f) => {
      const coords = cellToGeoJsonRing(String(f.id ?? ""));
      return {
        type: "Feature" as const,
        properties: { count: f.properties.count ?? 1 },
        geometry: { type: "Polygon" as const, coordinates: [coords] },
      };
    });
  return { type: "FeatureCollection", features: hexFeatures };
};

/** Convert child features (from server) to hex polygon GeoJSON features for hover display. */
export const childFeaturesToHexPolygons = (
  children: Array<{ id?: string | number; properties?: Record<string, unknown> }>
): GeoJSON.Feature[] => {
  const features: GeoJSON.Feature[] = [];
  for (const child of children) {
    const cellId = String((child.properties?.clusterId ?? child.id ?? "") as string | number);
    if (!isLongValidCell(cellId)) continue;
    const coords = cellToGeoJsonRing(cellId);
    features.push({
      type: "Feature",
      properties: { intensity: 0.5, count: Number(child.properties?.count ?? 1) },
      geometry: { type: "Polygon", coordinates: [coords] },
    });
  }
  return features;
};
