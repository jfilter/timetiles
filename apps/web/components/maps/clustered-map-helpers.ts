/**
 * Helper functions for the ClusteredMap component.
 *
 * @module
 * @category Components
 */
import { defaultMapColors, type MapColors } from "@timetiles/ui/lib/chart-themes";
import type { Feature } from "geojson";
import type { LayerSpecification } from "maplibre-gl";
import type { MapRef } from "react-map-gl/maplibre";

import { type ClusterStats, DEFAULT_CLUSTER_STATS, ensureAscendingPercentiles } from "@/lib/constants/map";
import { createLogger } from "@/lib/logger";
import type { SimpleBounds } from "@/lib/utils/event-params";

import type { ClusterFeature } from "./clustered-map";

/** Circle layer config without `source` (provided by the `<Source>` wrapper). */
type CircleLayerConfig = Omit<Extract<LayerSpecification, { type: "circle" }>, "source">;

const logger = createLogger("ClusteredMap");

/** Default empty clusters array */
export const DEFAULT_CLUSTERS: ClusterFeature[] = [];

/** Initial view state for the map */
export const INITIAL_VIEW_STATE = { longitude: -74, latitude: 40.6, zoom: 9 };

/** CSS style for the map component */
export const MAP_COMPONENT_STYLE = { width: "100%", height: "100%", minHeight: "400px" };

/** Layer IDs that respond to click events */
export const INTERACTIVE_LAYER_IDS = ["event-clusters", "unclustered-point"];

/** Build event point layer configuration with the given map colors. */
export const buildEventPointLayerConfig = (colors: MapColors = defaultMapColors) =>
  ({
    id: "unclustered-point",
    type: "circle" as const,
    paint: {
      "circle-color": colors.mapPoint,
      "circle-radius": 6,
      "circle-opacity": 1,
      "circle-stroke-width": 1,
      "circle-stroke-color": colors.mapStroke,
    },
  }) satisfies CircleLayerConfig;

/** Extract valid coordinates from a GeoJSON feature */
export const getValidCoordinates = (feature: Feature): [number, number] | null => {
  const coordinates = feature.geometry?.type === "Point" ? feature.geometry.coordinates : null;
  if (coordinates && coordinates.length >= 2) {
    const [lng, lat] = coordinates as [number, number];
    if (typeof lng === "number" && typeof lat === "number" && !Number.isNaN(lng) && !Number.isNaN(lat)) {
      return [lng, lat];
    }
  }
  return null;
};

/** Compute global stats from cluster stats with percentile normalization */
export const computeGlobalStats = (globalClusterStats: ClusterStats | undefined): ClusterStats => {
  const rawStats = globalClusterStats ?? DEFAULT_CLUSTER_STATS;
  const stats = ensureAscendingPercentiles(rawStats);

  logger.debug("Global cluster stats for size/color", { rawStats, stats });

  return stats;
};

/** Compute viewport-relative stats for opacity (shows density within current view) */
export const computeViewportStats = (clusters: ClusterFeature[]): ClusterStats => {
  if (clusters.length === 0) {
    return DEFAULT_CLUSTER_STATS;
  }

  const counts = clusters
    .map((c) => c.properties.count ?? 1)
    .filter((count) => count > 1) // Only consider actual clusters, not individual points
    .sort((a, b) => a - b);

  if (counts.length === 0) {
    return DEFAULT_CLUSTER_STATS;
  }

  const getPercentile = (arr: number[], percentile: number) => {
    const index = Math.ceil((percentile / 100) * arr.length) - 1;
    return arr[Math.max(0, index)];
  };

  const rawStats = {
    p20: getPercentile(counts, 20),
    p40: getPercentile(counts, 40),
    p60: getPercentile(counts, 60),
    p80: getPercentile(counts, 80),
    p100: Math.max(...counts),
  };

  const stats = ensureAscendingPercentiles(rawStats);

  logger.debug("Viewport cluster percentiles for opacity", {
    totalClusters: clusters.length,
    clusterCounts: counts.length,
    rawStats,
    stats,
  });

  return stats;
};

/** Build the cluster layer configuration based on global and viewport stats */
export const buildClusterLayerConfig = (
  globalStats: ClusterStats,
  viewportStats: ClusterStats,
  clusterFilter: ["==", ["get", string], string],
  colors: MapColors = defaultMapColors
) =>
  ({
    id: "event-clusters",
    type: "circle" as const,
    filter: clusterFilter,
    paint: {
      // Size based on GLOBAL percentiles (consistent across all views)
      "circle-radius": [
        "step",
        ["get", "count"],
        16, // Default: very small (0-p20)
        globalStats.p20,
        22, // Level 2: small (p20-p40)
        globalStats.p40,
        28, // Level 3: medium (p40-p60)
        globalStats.p60,
        34, // Level 4: large (p60-p80)
        globalStats.p80,
        40, // Level 5: max size (p80-p100)
      ],
      // Color based on GLOBAL percentiles (consistent across all views)
      "circle-color": [
        "step",
        ["get", "count"],
        colors.mapClusterGradient[0], // Level 1 (0-p20)
        globalStats.p20,
        colors.mapClusterGradient[1], // Level 2 (p20-p40)
        globalStats.p40,
        colors.mapClusterGradient[2], // Level 3 (p40-p60)
        globalStats.p60,
        colors.mapClusterGradient[3], // Level 4 (p60-p80)
        globalStats.p80,
        colors.mapClusterGradient[4], // Level 5 (p80-p100)
      ],
      // Opacity based on VIEWPORT percentiles (shows relative density in current view)
      "circle-opacity": [
        "step",
        ["get", "count"],
        0.3, // Level 1: light (0-p20)
        viewportStats.p20,
        0.45, // Level 2: medium-light (p20-p40)
        viewportStats.p40,
        0.6, // Level 3: medium (p40-p60)
        viewportStats.p60,
        0.75, // Level 4: medium-high (p60-p80)
        viewportStats.p80,
        0.9, // Level 5: max opacity (p80-p100)
      ],
      "circle-stroke-width": 2,
      "circle-stroke-color": colors.mapStroke,
      "circle-stroke-opacity": 0.8,
    },
  }) satisfies CircleLayerConfig;

/** Fit map to bounds, handling single-point case */
export const fitMapToBounds = (
  map: MapRef,
  bounds: SimpleBounds,
  options: { padding?: number; animate?: boolean; maxZoom?: number } = {}
): void => {
  const { padding = 50, animate = true, maxZoom = 16 } = options;

  // Handle single-point case (north === south, east === west)
  if (bounds.north === bounds.south && bounds.east === bounds.west) {
    map.flyTo({ center: [bounds.west, bounds.north], zoom: 14, animate });
    return;
  }

  map.fitBounds(
    [
      [bounds.west, bounds.south],
      [bounds.east, bounds.north],
    ],
    { padding, animate, maxZoom }
  );
};

/** Log map initialization details */
export const logMapInitialized = (
  map: MapRef,
  hadInitialBounds: boolean
): { bounds: ReturnType<MapRef["getBounds"]>; zoom: number } => {
  const bounds = map.getBounds();
  const zoom = map.getZoom();

  logger.debug("Map initialized", {
    bounds: { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() },
    zoom: zoom,
    center: map.getCenter(),
    hadInitialBounds,
  });

  return { bounds, zoom };
};

/** Log map viewport change */
export const logMapViewportChanged = (map: MapRef): { bounds: ReturnType<MapRef["getBounds"]>; zoom: number } => {
  const bounds = map.getBounds();
  const zoom = map.getZoom();

  logger.trace("Map viewport changed", {
    zoom,
    bounds: { north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest() },
  });

  return { bounds, zoom };
};
