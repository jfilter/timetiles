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

/** Symbol layer config without `source`. */
type SymbolLayerConfig = Omit<Extract<LayerSpecification, { type: "symbol" }>, "source">;

/** Fill layer config without `source`. */
type FillLayerConfig = Omit<Extract<LayerSpecification, { type: "fill" }>, "source">;

/** Line layer config without `source`. */
type LineLayerConfig = Omit<Extract<LayerSpecification, { type: "line" }>, "source">;

const logger = createLogger("ClusteredMap");

/** Default empty clusters array */
export const DEFAULT_CLUSTERS: ClusterFeature[] = [];

/** Initial view state for the map (Berlin Alexanderplatz) */
export const INITIAL_VIEW_STATE = { longitude: 13.4125, latitude: 52.5219, zoom: 12 };

/** CSS style for the map component */
export const MAP_COMPONENT_STYLE = { width: "100%", height: "100%", minHeight: "400px" };

/** Layer IDs that respond to pointer interactions. */
export const INTERACTIVE_LAYER_IDS = [
  "event-clusters",
  "event-locations",
  "cluster-count-label",
  "location-count-label",
];

/**
 * Build location marker layer — same gradient style as clusters but for
 * individual locations (H3 r15 cells). Scales radius by event count.
 */
export const buildLocationLayerConfig = (
  locationFilter: ["==", ["get", string], string],
  colors: MapColors = defaultMapColors,
  maxCount: number = 1,
  highlightedCells: string[] | null = null
) => {
  const sqrtMax = Math.max(1, Math.sqrt(maxCount));

  const highlightedCellsList = highlightedCells ?? [];
  const h3CellMatchFilter =
    highlightedCells?.length === 1
      ? ["==", ["get", "h3Cell"], highlightedCells[0]]
      : ["in", ["get", "h3Cell"], ["literal", highlightedCellsList]];
  const isHighlighted = highlightedCells != null ? h3CellMatchFilter : null;

  const normalOpacity = [
    "interpolate",
    ["linear"],
    ["/", ["sqrt", ["coalesce", ["get", "count"], 1]], sqrtMax],
    0,
    0.55,
    1,
    0.92,
  ];
  const circleOpacity = isHighlighted ? ["case", isHighlighted, normalOpacity, 0.15] : normalOpacity;

  return {
    id: "event-locations",
    type: "circle" as const,
    filter: locationFilter,
    paint: {
      "circle-radius": [
        "interpolate",
        ["linear"],
        ["/", ["sqrt", ["coalesce", ["get", "count"], 1]], sqrtMax],
        0,
        6,
        0.25,
        10,
        0.5,
        16,
        0.75,
        22,
        1,
        28,
      ],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["/", ["sqrt", ["coalesce", ["get", "count"], 1]], sqrtMax],
        0,
        colors.mapClusterGradient[0],
        0.25,
        colors.mapClusterGradient[1],
        0.5,
        colors.mapClusterGradient[2],
        0.75,
        colors.mapClusterGradient[3],
        1,
        colors.mapClusterGradient[4],
      ],
      "circle-opacity": circleOpacity as never,
      "circle-stroke-width": 1.5,
      "circle-stroke-color": colors.mapStroke,
      "circle-stroke-opacity": isHighlighted ? (["case", isHighlighted, 0.8, 0.1] as never) : 0.8,
    },
  } satisfies CircleLayerConfig;
};

/**
 * Build location count label — shows event count on locations with count > 1.
 */
export const buildLocationLabelLayerConfig = (
  locationFilter: ["==", ["get", string], string],
  highlightedCells: string[] | null = null
) => {
  const highlightedCellsList = highlightedCells ?? [];
  const h3CellMatchFilter =
    highlightedCells?.length === 1
      ? ["==", ["get", "h3Cell"], highlightedCells[0]]
      : ["in", ["get", "h3Cell"], ["literal", highlightedCellsList]];
  const isHighlighted = highlightedCells != null ? h3CellMatchFilter : null;
  const textOpacity = isHighlighted ? ["case", isHighlighted, 1, 0.15] : 1;

  return {
    id: "location-count-label",
    type: "symbol" as const,
    filter: ["all", locationFilter, [">", ["coalesce", ["get", "count"], 1], 1]],
    layout: {
      "text-field": [
        "case",
        [">=", ["get", "count"], 1000000],
        ["concat", ["to-string", ["round", ["/", ["get", "count"], 100000]]], "M"],
        [">=", ["get", "count"], 10000],
        ["concat", ["to-string", ["round", ["/", ["get", "count"], 1000]]], "k"],
        [">=", ["get", "count"], 1000],
        ["concat", ["to-string", ["/", ["round", ["/", ["get", "count"], 100]], 10]], "k"],
        ["to-string", ["get", "count"]],
      ],
      "text-size": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 9, 25, 13],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0, 0, 0, 0.5)",
      "text-halo-width": 1,
      "text-opacity": textOpacity as never,
    },
  } satisfies SymbolLayerConfig;
};

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
 * Build the cluster circle layer with count-based sizing.
 *
 * Circle area is proportional to event count (sqrt scaling).
 * Color gradient encodes density. Count is shown as a label
 * by a separate symbol layer (see buildClusterLabelLayerConfig).
 *
 * Two clustering algorithms are available (selected via API parameter):
 * - **Grid**: fast spatial grid (ROUND/GROUP BY), deterministic cells, may split
 *   clusters at grid boundaries. Best for high event counts.
 * - **DBSCAN**: density-based (ST_ClusterDBSCAN), no boundary artifacts, projects
 *   to SRID 3857 for meter-based eps. Falls back to grid above 5000 events.
 *
 * Future: cluster-inspect mode (click → dim map + spider-view of events).
 */
export const buildClusterLayerConfig = (
  clusterFilter: ["==", ["get", string], string],
  colors: MapColors = defaultMapColors,
  maxCount: number = 1,
  highlightedCells: string[] | null = null
) => {
  // Normalize count relative to viewport max using sqrt scaling (0..1)
  const sqrtMax = Math.max(1, Math.sqrt(maxCount));

  // When cells are highlighted (focus or filter), dim all others and bold-border the highlighted ones
  const highlightedCellsList = highlightedCells ?? [];
  const clusterMatchFilter =
    highlightedCells?.length === 1
      ? ["==", ["get", "clusterId"], highlightedCells[0]]
      : ["in", ["get", "clusterId"], ["literal", highlightedCellsList]];
  const isHighlighted = highlightedCells != null ? clusterMatchFilter : null;

  const normalOpacity = ["interpolate", ["linear"], ["/", ["sqrt", ["get", "count"]], sqrtMax], 0, 0.55, 1, 0.92];
  const circleOpacity = isHighlighted ? ["case", isHighlighted, normalOpacity, 0.15] : normalOpacity;

  const normalStrokeWidth = ["interpolate", ["linear"], ["/", ["sqrt", ["get", "count"]], sqrtMax], 0, 1, 1, 2.5];
  const strokeWidth = isHighlighted ? ["case", isHighlighted, 3.5, normalStrokeWidth] : normalStrokeWidth;

  const normalStrokeColor = colors.mapStroke;
  const strokeColor = isHighlighted ? ["case", isHighlighted, "#3b82f6", normalStrokeColor] : normalStrokeColor;

  const normalStrokeOpacity = 0.8;
  const strokeOpacity = isHighlighted ? ["case", isHighlighted, 1, 0.1] : normalStrokeOpacity;

  return {
    id: "event-clusters",
    type: "circle" as const,
    filter: clusterFilter,
    paint: {
      // Circle radius: sqrt-scaled relative to maxCount, capped at hex cell size
      "circle-radius": [
        "min",
        [
          "interpolate",
          ["linear"],
          ["/", ["sqrt", ["get", "count"]], sqrtMax],
          0,
          8,
          0.25,
          16,
          0.5,
          28,
          0.75,
          40,
          1,
          50,
        ],
        ["coalesce", ["get", "hexRadius"], 50],
      ],
      "circle-color": [
        "interpolate",
        ["linear"],
        ["/", ["sqrt", ["get", "count"]], sqrtMax],
        0,
        colors.mapClusterGradient[0],
        0.25,
        colors.mapClusterGradient[1],
        0.5,
        colors.mapClusterGradient[2],
        0.75,
        colors.mapClusterGradient[3],
        1,
        colors.mapClusterGradient[4],
      ],

      "circle-opacity": circleOpacity as never,
      "circle-stroke-width": strokeWidth as never,
      "circle-stroke-color": strokeColor as never,
      "circle-stroke-opacity": strokeOpacity as never,
    },
  } satisfies CircleLayerConfig;
};

/** H3 hex fill layer (debug: shows hex boundaries with count-based color) */
export const buildH3FillLayerConfig = (colors: MapColors = defaultMapColors, maxCount: number = 1) => {
  const sqrtMax = Math.max(1, Math.sqrt(maxCount));
  return {
    id: "h3-hex-fill",
    type: "fill" as const,
    paint: {
      "fill-color": [
        "interpolate",
        ["linear"],
        ["/", ["sqrt", ["get", "count"]], sqrtMax],
        0,
        colors.mapClusterGradient[0],
        0.25,
        colors.mapClusterGradient[1],
        0.5,
        colors.mapClusterGradient[2],
        0.75,
        colors.mapClusterGradient[3],
        1,
        colors.mapClusterGradient[4],
      ],
      "fill-opacity": 0.4,
    },
  } satisfies FillLayerConfig;
};

/** H3 hex outline layer (debug: shows hex edges) */
export const buildH3OutlineLayerConfig = (colors: MapColors = defaultMapColors) =>
  ({
    id: "h3-hex-outline",
    type: "line" as const,
    paint: { "line-color": colors.mapStroke, "line-width": 1, "line-opacity": 0.6 },
  }) satisfies LineLayerConfig;

/** H3 hover highlight fill layer — subtle area preview, no color change */
export const buildH3HoverFillLayerConfig = (colors: MapColors = defaultMapColors) =>
  ({
    id: "h3-hover-fill",
    type: "fill" as const,
    paint: { "fill-color": colors.mapClusterGradient[1], "fill-opacity": 0.2 },
  }) satisfies FillLayerConfig;

/** H3 hover highlight outline layer */
export const buildH3HoverOutlineLayerConfig = () =>
  ({
    id: "h3-hover-outline",
    type: "line" as const,
    paint: { "line-color": "#ffffff", "line-width": 2.5, "line-opacity": 0.9 },
  }) satisfies LineLayerConfig;

/**
 * Build the cluster count label layer.
 *
 * Renders the event count as a white number centered on each cluster circle.
 * Only shown for clusters (count > 1), not individual event points.
 * Counts ≥ 1000 are shown in compact notation (1.2k, 15k, 1.2M).
 */
export const buildClusterLabelLayerConfig = (
  clusterFilter: ["==", ["get", string], string],
  highlightedCells: string[] | null = null
) => {
  const highlightedCellsList = highlightedCells ?? [];
  const clusterMatchFilter =
    highlightedCells?.length === 1
      ? ["==", ["get", "clusterId"], highlightedCells[0]]
      : ["in", ["get", "clusterId"], ["literal", highlightedCellsList]];
  const isHighlighted = highlightedCells != null ? clusterMatchFilter : null;
  const textOpacity = isHighlighted ? ["case", isHighlighted, 1, 0.15] : 1;

  return {
    id: "cluster-count-label",
    type: "symbol" as const,
    filter: clusterFilter,
    layout: {
      "text-field": [
        "case",
        [">=", ["get", "count"], 1000000],
        ["concat", ["to-string", ["round", ["/", ["get", "count"], 100000]]], "M"],
        [">=", ["get", "count"], 10000],
        ["concat", ["to-string", ["round", ["/", ["get", "count"], 1000]]], "k"],
        [">=", ["get", "count"], 1000],
        ["concat", ["to-string", ["/", ["round", ["/", ["get", "count"], 100]], 10]], "k"],
        ["to-string", ["get", "count"]],
      ],
      "text-size": ["interpolate", ["linear"], ["sqrt", ["get", "count"]], 1, 10, 25, 14],
      "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
      "text-allow-overlap": true,
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "rgba(0, 0, 0, 0.5)",
      "text-halo-width": 1,

      "text-opacity": textOpacity as never,
    },
  } satisfies SymbolLayerConfig;
};

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
