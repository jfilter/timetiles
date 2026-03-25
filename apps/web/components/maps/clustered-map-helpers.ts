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

import { createLogger } from "@/lib/logger";
import type { SimpleBounds } from "@/lib/utils/event-params";

import type { ClusterFeature } from "./clustered-map";

/** Circle layer config without `source` (provided by the `<Source>` wrapper). */
type CircleLayerConfig = Omit<Extract<LayerSpecification, { type: "circle" }>, "source">;

const logger = createLogger("ClusteredMap");

/** Default empty clusters array */
export const DEFAULT_CLUSTERS: ClusterFeature[] = [];

/** Initial view state for the map (Berlin Alexanderplatz) */
export const INITIAL_VIEW_STATE = { longitude: 13.4125, latitude: 52.5219, zoom: 12 };

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

/**
 * Build the cluster layer configuration using continuous sqrt-based scaling.
 *
 * Uses MapLibre's native `sqrt` expression for proportional area scaling
 * (cartographic best practice: circle area proportional to event count).
 * Every cluster gets a unique size — no discrete banding.
 */
export const buildClusterLayerConfig = (
  clusterFilter: ["==", ["get", string], string],
  colors: MapColors = defaultMapColors
) =>
  ({
    id: "event-clusters",
    type: "circle" as const,
    filter: clusterFilter,
    paint: {
      // Radius = max(count-based sqrt, geographic extent)
      // sqrt sizing provides visual hierarchy; extent ensures coverage
      "circle-radius": [
        "max",
        // Count-based radius (visual hierarchy via sqrt)
        [
          "interpolate",
          ["linear"],
          ["sqrt", ["get", "count"]],
          1,
          8, // sqrt(1)=1 → 8px
          5,
          16, // sqrt(25)=5 → 16px
          10,
          24, // sqrt(100)=10 → 24px
          18,
          34, // sqrt(~324)=18 → 34px
          25,
          50, // sqrt(625)=25 → 50px
        ],
        // Geographic extent radius (pixels, pre-computed server-side)
        ["coalesce", ["get", "extentRadius"], 0],
      ],
      // Continuous color gradient based on sqrt(count)
      "circle-color": [
        "interpolate",
        ["linear"],
        ["sqrt", ["get", "count"]],
        1,
        colors.mapClusterGradient[0], // lightest
        5,
        colors.mapClusterGradient[1],
        10,
        colors.mapClusterGradient[2],
        18,
        colors.mapClusterGradient[3],
        25,
        colors.mapClusterGradient[4], // darkest
      ],
      // Continuous opacity
      "circle-opacity": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 0.55, 25, 0.92],
      // Continuous stroke width
      "circle-stroke-width": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 1, 25, 2.5],
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
