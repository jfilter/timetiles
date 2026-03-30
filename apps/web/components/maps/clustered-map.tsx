/**
 * Map component with clustering support for event visualization.
 *
 * Renders events as clustered markers on a Mapbox map, with dynamic
 * clustering based on zoom level and viewport bounds. Supports popups,
 * click interactions, and real-time cluster updates.
 *
 * @module
 * @category Components
 */

"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { useMapColors } from "@timetiles/ui/hooks/use-chart-theme";
import { cellToBoundary, isValidCell } from "h3-js";
import { X } from "lucide-react";
import type { LngLatBounds, MapLayerMouseEvent, MapMouseEvent } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import MapGL, { Layer, type MapRef, NavigationControl, Popup, Source } from "react-map-gl/maplibre";

import { MAP_STYLES, MAP_STYLES_BY_PRESET } from "@/lib/constants/map";
import { useTheme } from "@/lib/hooks/use-theme";
import { useThemePreset } from "@/lib/hooks/use-theme-preset";
import type { ClusterSummaryResponse } from "@/lib/schemas/events";
import { useUIStore } from "@/lib/store";
import type { SimpleBounds } from "@/lib/utils/event-params";

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
  for (const p of pts.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
};

import { ClusterFocusPanel } from "./cluster-focus-panel";
import {
  buildClusterLabelLayerConfig,
  buildClusterLayerConfig,
  buildEventPointLayerConfig,
  buildH3FillLayerConfig,
  buildH3HoverFillLayerConfig,
  buildH3HoverOutlineLayerConfig,
  buildH3OutlineLayerConfig,
  DEFAULT_CLUSTERS,
  fitMapToBounds,
  INITIAL_VIEW_STATE,
  INTERACTIVE_LAYER_IDS,
  logMapInitialized,
  logMapViewportChanged,
  MAP_COMPONENT_STYLE,
} from "./clustered-map-helpers";
import { MapErrorOverlay, MapLoadingOverlay } from "./map-overlays";
import { MapPreferencesControl } from "./map-preferences-control";
import { useClusterTransition } from "./use-cluster-transition";
import { useH3Transition } from "./use-h3-transition";
import { useMapInteractions } from "./use-map-interactions";

export interface ClusterFeature {
  type: "Feature";
  id?: string | number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    type: "event-cluster" | "event-point";
    count?: number;
    eventId?: number;
    title?: string;
    extentRadius?: number;
    sourceCells?: string[];
  };
}

/**
 * Map view state for center coordinates and zoom level.
 * Used for URL-based map position persistence.
 */
export interface MapViewState {
  latitude: number;
  longitude: number;
  zoom: number;
}

interface ClusteredMapProps {
  onBoundsChange?: (bounds: LngLatBounds, zoom: number, center?: { lng: number; lat: number }) => void;
  onEventClick?: (eventId: number) => void;
  clusters?: ClusterFeature[];
  clusterChildren?: ClusterFeature[] | null;
  clusterSummary?: ClusterSummaryResponse;
  clusterSummaryLoading?: boolean;
  initialBounds?: SimpleBounds | null;
  initialViewState?: MapViewState | null;
  isLoadingBounds?: boolean;
  isError?: boolean;
}

export interface ClusteredMapHandle {
  resize: () => void;
  fitBounds: (bounds: SimpleBounds, options?: { padding?: number; animate?: boolean }) => void;
}

type MapEventTarget = {
  getBounds: () => LngLatBounds;
  getZoom: () => number;
  getCenter: () => { lng: number; lat: number };
};

/* oxlint-disable complexity */
export const ClusteredMap = forwardRef<ClusteredMapHandle, ClusteredMapProps>(
  (
    {
      onBoundsChange,
      onEventClick,
      clusters = DEFAULT_CLUSTERS,
      clusterChildren,
      clusterSummary,
      clusterSummaryLoading,
      initialBounds,
      initialViewState,
      isLoadingBounds,
      isError,
    },
    ref
  ) => {
    const t = useTranslations("Explore");
    const { resolvedTheme } = useTheme();
    const { preset } = useThemePreset();
    const mapColors = useMapColors();
    const mapRef = useRef<MapRef | null>(null);
    const presetStyles = MAP_STYLES_BY_PRESET[preset] ?? MAP_STYLES;
    const mapStyleUrl = presetStyles[resolvedTheme];
    const [currentZoom, setCurrentZoom] = useState(INITIAL_VIEW_STATE.zoom);
    const { popupInfo, closePopup, handleClick, handleFocusedClusterZoom, clearFocusedCluster } = useMapInteractions({
      formatFallbackTitle: (id) => t("eventFallbackTitle", { id }),
      onEventClick,
      zoom: currentZoom,
    });

    const algorithm = useUIStore((s) => s.ui.clusterAlgorithm);
    const showHex = useUIStore((s) => s.ui.showHexBoundaries);
    const clusterDisplay = useUIStore((s) => s.ui.clusterDisplay);
    const hexagonMode = algorithm === "h3" && clusterDisplay === "hexagons";
    const clusterFilterCells = useUIStore((s) => s.ui.clusterFilterCells);
    const focusedCluster = useUIStore((s) => s.ui.focusedCluster);
    // Highlighted cells: focused cluster or cluster filter — used for dimming
    const highlightedCells = focusedCluster
      ? (focusedCluster.sourceCells ?? [focusedCluster.clusterId])
      : clusterFilterCells;

    // Animated clusters + maxCount (needed by hover handler for intensity scaling)
    const h3Animated = useH3Transition(algorithm === "h3" ? clusters : DEFAULT_CLUSTERS);
    const genericAnimated = useClusterTransition(algorithm !== "h3" ? clusters : DEFAULT_CLUSTERS);
    const animatedClusters = algorithm === "h3" ? h3Animated : genericAnimated;
    const geojsonData = { type: "FeatureCollection" as const, features: animatedClusters };
    const maxCount = useMemo(
      () => animatedClusters.reduce((max, f) => Math.max(max, f.properties.count ?? 1), 1),
      [animatedClusters]
    );

    // H3 hover state: hexagon cells to highlight
    const [isMapPositioned, setIsMapPositioned] = useState(!!initialViewState);
    const [hoverHexData, setHoverHexData] = useState<GeoJSON.FeatureCollection>({
      type: "FeatureCollection",
      features: [],
    });
    const hoveredClusterIdRef = useRef<string | null>(null);
    const hoverCacheRef = useRef<Record<string, GeoJSON.Feature[]>>({});
    const hoverAbortRef = useRef<AbortController | null>(null);

    /** Convert server child features to hex polygons. */
    const childFeaturesToHexPolygons = useCallback(
      (children: Array<{ id?: string | number; properties?: Record<string, unknown> }>): GeoJSON.Feature[] => {
        const features: GeoJSON.Feature[] = [];
        for (const child of children) {
          const cellId = String(child.properties?.clusterId ?? child.id ?? "");
          if (cellId.length < 5) continue;
          try {
            if (!isValidCell(cellId)) continue;
          } catch {
            continue;
          }
          const boundary = cellToBoundary(cellId);
          const coords = boundary.map(([lat, lng]) => [lng, lat] as [number, number]);
          if (coords.length > 0) coords.push(coords[0]!);
          features.push({
            type: "Feature",
            properties: { intensity: 0.5, count: Number(child.properties?.count ?? 1) },
            geometry: { type: "Polygon", coordinates: [coords] },
          });
        }
        return features;
      },
      []
    );

    const handleH3Hover = useCallback(
      (e: { features?: Array<{ id?: string | number; properties?: Record<string, unknown> }> }) => {
        if (algorithm !== "h3") return;
        if (!e.features?.length) return;
        const feature = e.features[0];
        if (!feature) return;

        // Only show children for clusters, not individual event points
        if (feature.properties?.type !== "event-cluster") {
          if (hoveredClusterIdRef.current) {
            hoveredClusterIdRef.current = null;
            setHoverHexData({ type: "FeatureCollection", features: [] });
          }
          return;
        }

        // Skip if same cluster as last hover
        const clusterId = String(feature.properties?.clusterId ?? feature.id ?? "");
        if (clusterId === hoveredClusterIdRef.current) return;
        hoveredClusterIdRef.current = clusterId;

        // Cancel any in-flight hover fetch
        hoverAbortRef.current?.abort();

        // Check cache first
        const cached = hoverCacheRef.current[clusterId];
        if (cached) {
          setHoverHexData({ type: "FeatureCollection", features: cached });
          return;
        }

        // Clear previous hover while loading
        setHoverHexData({ type: "FeatureCollection", features: [] });

        // Resolve parent cells for the API call
        const rawSourceCells = feature.properties?.sourceCells;
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
        if (parentCells.length === 0) return;

        // Fetch child cells with real events from the server
        const abort = new AbortController();
        hoverAbortRef.current = abort;
        // Inherit current page filters (catalog, datasets, dates, etc.) from the URL
        const pageParams = new URLSearchParams(window.location.search);
        const params = new URLSearchParams();
        for (const key of ["catalog", "datasets", "startDate", "endDate", "ff"]) {
          const val = pageParams.get(key);
          if (val) params.set(key, val);
        }
        params.set("parentCells", parentCells.join(","));
        params.set("zoom", String(Math.round(currentZoom)));
        params.set("targetClusters", "100");
        // Add bounds from current viewport
        const map = mapRef.current?.getMap();
        if (map) {
          const b = map.getBounds();
          params.set(
            "bounds",
            JSON.stringify({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() })
          );
        }

        void fetch(`/api/v1/events/geo?${params}`, { signal: abort.signal })
          .then((r) => r.json())
          .then((data: { features?: Array<{ id?: string | number; properties?: Record<string, unknown> }> }) => {
            if (hoveredClusterIdRef.current !== clusterId) return undefined;
            const hexFeatures = childFeaturesToHexPolygons(data.features ?? []);
            hoverCacheRef.current[clusterId] = hexFeatures;
            setHoverHexData({ type: "FeatureCollection", features: hexFeatures });
            return undefined;
          })
          .catch(() => {
            /* aborted or error, ignore */
          });
      },
      [algorithm, currentZoom, childFeaturesToHexPolygons]
    );

    const handleH3HoverLeave = useCallback(() => {
      hoveredClusterIdRef.current = null;
      hoverAbortRef.current?.abort();
      setHoverHexData({ type: "FeatureCollection", features: [] });
    }, []);

    // Native mousemove handler to detect cluster hover across features
    // (react-map-gl's onMouseEnter only fires once per layer entry, not per feature)
    // Re-attaches when map becomes positioned (loaded) or algorithm changes.
    useEffect(() => {
      if (!isMapPositioned) return;
      const map = mapRef.current?.getMap();
      if (!map) return;

      // H3 hover: fetch child cells when hovering clusters
      const onMove = (e: MapMouseEvent) => {
        if (algorithm !== "h3") return;
        const features = map.queryRenderedFeatures(e.point, { layers: ["event-clusters"] });
        if (features.length > 0 && features[0]?.properties?.type === "event-cluster") {
          handleH3Hover({
            features: features as Array<{ id?: string | number; properties?: Record<string, unknown> }>,
          });
        } else if (hoveredClusterIdRef.current) {
          handleH3HoverLeave();
        }
      };
      map.on("mousemove", onMove);

      return () => {
        map.off("mousemove", onMove);
      };
    }, [isMapPositioned, algorithm, handleH3Hover, handleH3HoverLeave]);

    const hasAppliedBoundsRef = useRef(false);

    useImperativeHandle(ref, () => ({
      resize: () => mapRef.current?.resize(),
      fitBounds: (bounds: SimpleBounds, options = {}) => {
        if (mapRef.current) fitMapToBounds(mapRef.current, bounds, options);
      },
    }));

    // Fit map to bounds when they arrive after the initial map load (race condition fix:
    // onLoad fires once before the bounds query resolves, so we need this effect)
    useEffect(() => {
      if (!initialViewState && initialBounds && mapRef.current && !hasAppliedBoundsRef.current) {
        fitMapToBounds(mapRef.current, initialBounds, { animate: false });
        hasAppliedBoundsRef.current = true;
        setIsMapPositioned(true);
      }
    }, [initialBounds, initialViewState]);

    const handleLoad = (evt: { target: MapEventTarget }) => {
      const map = evt.target as MapRef;
      if (initialViewState) {
        map.flyTo({
          center: [initialViewState.longitude, initialViewState.latitude],
          zoom: initialViewState.zoom,
          animate: false,
        });
        hasAppliedBoundsRef.current = true;
      } else if (initialBounds) {
        fitMapToBounds(map, initialBounds, { animate: false });
        hasAppliedBoundsRef.current = true;
      }
      setIsMapPositioned(true);
      const { bounds, zoom } = logMapInitialized(map, !!initialBounds || !!initialViewState);
      const center = map.getCenter();
      onBoundsChange?.(bounds, zoom, { lng: center.lng, lat: center.lat });
    };

    const handleMoveEnd = (evt: { target: MapEventTarget }) => {
      const map = evt.target as MapRef;
      const { bounds, zoom } = logMapViewportChanged(map);
      setCurrentZoom(zoom);
      const center = map.getCenter();
      onBoundsChange?.(bounds, zoom, { lng: center.lng, lat: center.lat });
    };

    const eventPointFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-point"];
    const clusterFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-cluster"];
    const eventPointLayer = {
      ...buildEventPointLayerConfig(mapColors, highlightedCells != null),
      filter: eventPointFilter,
    };
    const clusterLayer = buildClusterLayerConfig(clusterFilter, mapColors, maxCount, highlightedCells);
    const clusterLabelLayer = buildClusterLabelLayerConfig(clusterFilter, highlightedCells);

    // H3 hex polygon layer (shows hexagon boundaries when H3 algorithm is active)
    const h3HexData = useMemo(() => {
      if (algorithm !== "h3") return { type: "FeatureCollection" as const, features: [] };
      const hexFeatures = animatedClusters
        .filter((f) => {
          const id = String(f.id ?? "");
          try {
            return id.length > 5 && isValidCell(id);
          } catch {
            return false;
          }
        })
        .map((f) => {
          const id = String(f.id ?? "");
          const boundary = cellToBoundary(id);
          // h3-js returns [lat, lng], GeoJSON needs [lng, lat]
          const coords = boundary.map(([lat, lng]) => [lng, lat] as [number, number]);
          if (coords.length > 0) coords.push(coords[0]!); // close polygon
          return {
            type: "Feature" as const,
            properties: { count: f.properties.count ?? 1 },
            geometry: { type: "Polygon" as const, coordinates: [coords] },
          };
        });
      return { type: "FeatureCollection" as const, features: hexFeatures };
    }, [algorithm, animatedClusters]);
    // Merge group outlines: convex hull polygon around circles in the same merge group
    const mergeGroupData = useMemo(() => {
      if (algorithm !== "h3") return { type: "FeatureCollection" as const, features: [] as GeoJSON.Feature[] };
      // Group clusters by their sourceCells key
      const groups = new Map<string, Array<[number, number]>>();
      for (const f of animatedClusters) {
        const sc = f.properties.sourceCells;
        if (!sc || !Array.isArray(sc) || sc.length < 2) continue;
        const key = [...sc].sort().join(",");
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(f.geometry.coordinates);
      }
      // Build convex hull polygon for each group
      const features: GeoJSON.Feature[] = [];
      for (const [, points] of groups) {
        if (points.length < 2) continue;
        const hull = convexHull(points);
        if (hull.length >= 3) {
          hull.push(hull[0]!); // close ring
          features.push({ type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [hull] } });
        }
      }
      return { type: "FeatureCollection" as const, features };
    }, [algorithm, animatedClusters]);

    // Focused cluster: hex overlay from server-side children (only cells with events)
    const focusHexData = useMemo((): GeoJSON.FeatureCollection => {
      if (!focusedCluster || algorithm !== "h3" || !clusterChildren || clusterChildren.length === 0) {
        return { type: "FeatureCollection", features: [] };
      }
      const features: GeoJSON.Feature[] = [];
      for (const child of clusterChildren) {
        const childClusterId = String(child.properties.clusterId ?? child.id ?? "");
        if (childClusterId.length < 5) continue;
        try {
          if (!isValidCell(childClusterId)) continue;
        } catch {
          continue;
        }
        const boundary = cellToBoundary(childClusterId);
        const coords = boundary.map(([lat, lng]) => [lng, lat] as [number, number]);
        if (coords.length > 0) coords.push(coords[0]!);
        features.push({
          type: "Feature",
          properties: { intensity: 0.5, count: child.properties.count ?? 1 },
          geometry: { type: "Polygon", coordinates: [coords] },
        });
      }
      return { type: "FeatureCollection", features };
    }, [focusedCluster, algorithm, clusterChildren]);

    const h3FillLayer = buildH3FillLayerConfig(mapColors, maxCount);
    const h3OutlineLayer = buildH3OutlineLayerConfig(mapColors);
    const h3HoverFillLayer = buildH3HoverFillLayerConfig(mapColors);
    const h3HoverOutlineLayer = buildH3HoverOutlineLayerConfig();

    // Escape key exits focus mode
    useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape" && focusedCluster) clearFocusedCluster();
      };
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }, [focusedCluster, clearFocusedCluster]);

    // Double-click on focused cluster → zoom in
    const handleDblClick = useCallback(
      (event: MapLayerMouseEvent) => {
        if (!focusedCluster || !mapRef.current) return;
        const feature = event.features?.[0];
        if (feature && String(feature.id ?? "") === focusedCluster.clusterId) {
          event.preventDefault();
          handleFocusedClusterZoom(mapRef.current);
        }
      },
      [focusedCluster, handleFocusedClusterZoom]
    );

    // Focus mode: sub-cell heatmap hex polygons
    const focusSubcellHexData = useMemo(() => {
      if (!focusedCluster || !clusterChildren || clusterChildren.length === 0) {
        return { type: "FeatureCollection" as const, features: [] };
      }
      const hexFeatures = clusterChildren
        .filter((f) => {
          const id = String(f.id ?? "");
          try {
            return id.length > 5 && isValidCell(id);
          } catch {
            return false;
          }
        })
        .map((f) => {
          const id = String(f.id ?? "");
          const boundary = cellToBoundary(id);
          const coords = boundary.map(([lat, lng]) => [lng, lat] as [number, number]);
          if (coords.length > 0) coords.push(coords[0]!);
          return {
            type: "Feature" as const,
            properties: { count: f.properties.count ?? 1 },
            geometry: { type: "Polygon" as const, coordinates: [coords] },
          };
        });
      return { type: "FeatureCollection" as const, features: hexFeatures };
    }, [focusedCluster, clusterChildren]);

    const handleZoomInFromPanel = useCallback(() => {
      if (mapRef.current) handleFocusedClusterZoom(mapRef.current);
    }, [handleFocusedClusterZoom]);

    // Show loading overlay until map is positioned (opaque overlay hides default position)
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentional: false must also fall through
    const showLoading = isLoadingBounds || !isMapPositioned;

    return (
      <div className="relative h-full w-full">
        {showLoading && <MapLoadingOverlay message={t("loadingMapData")} />}
        {isError && !showLoading && <MapErrorOverlay title={t("unableToLoadMapData")} subtitle={t("mapLoadError")} />}
        <MapGL
          ref={mapRef}
          initialViewState={INITIAL_VIEW_STATE}
          style={MAP_COMPONENT_STYLE}
          mapStyle={mapStyleUrl}
          onMoveEnd={handleMoveEnd}
          onLoad={handleLoad}
          onClick={handleClick}
          onDblClick={handleDblClick}
          onMouseEnter={handleH3Hover}
          onMouseLeave={handleH3HoverLeave}
          interactiveLayerIds={INTERACTIVE_LAYER_IDS}
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1.5">
            <MapPreferencesControl />
          </div>
          {/* Hexagon mode: filled hex polygons as primary layer */}
          {hexagonMode && h3HexData.features.length > 0 && (
            <Source type="geojson" data={h3HexData} id="h3-hex-source">
              <Layer
                {...buildH3FillLayerConfig(mapColors, maxCount)}
                paint={{ ...buildH3FillLayerConfig(mapColors, maxCount).paint, "fill-opacity": 0.7 }}
              />
              <Layer {...h3OutlineLayer} paint={{ ...h3OutlineLayer.paint, "line-opacity": 0.8, "line-width": 1.5 }} />
            </Source>
          )}
          {/* Circle mode: merge group outlines (hex footprint behind merged circles) */}
          {!hexagonMode && mergeGroupData.features.length > 0 && (
            <Source type="geojson" data={mergeGroupData} id="merge-group-source">
              <Layer
                id="merge-group-fill"
                type="fill"
                paint={{ "fill-color": mapColors.mapClusterGradient[1], "fill-opacity": 0.15 }}
              />
              <Layer
                id="merge-group-outline"
                type="line"
                paint={{ "line-color": mapColors.mapClusterGradient[2], "line-width": 1.5, "line-opacity": 0.5 }}
              />
            </Source>
          )}
          {/* Circle mode: optional debug hex overlay */}
          {!hexagonMode && algorithm === "h3" && showHex && h3HexData.features.length > 0 && (
            <Source type="geojson" data={h3HexData} id="h3-hex-source">
              <Layer {...h3FillLayer} />
              <Layer {...h3OutlineLayer} />
            </Source>
          )}
          {/* Hover heatmap (child cells) */}
          {algorithm === "h3" && hoverHexData.features.length > 0 && !focusedCluster && (
            <Source type="geojson" data={hoverHexData} id="h3-hover-source">
              <Layer {...h3HoverFillLayer} />
              <Layer {...h3HoverOutlineLayer} />
            </Source>
          )}
          {/* Focus mode: persistent hex overlay for clicked cluster */}
          {focusHexData.features.length > 0 && (
            <Source type="geojson" data={focusHexData} id="h3-focus-source">
              <Layer {...h3HoverFillLayer} id="h3-focus-fill" />
              <Layer {...h3HoverOutlineLayer} id="h3-focus-outline" />
            </Source>
          )}
          {/* Focus mode: sub-cell heatmap (large clusters) — rendered below circles */}
          {focusedCluster && focusSubcellHexData.features.length > 0 && (
            <Source type="geojson" data={focusSubcellHexData} id="focus-subcell-source">
              <Layer {...buildH3FillLayerConfig(mapColors, maxCount)} id="focus-subcell-fill" />
              <Layer {...buildH3OutlineLayerConfig(mapColors)} id="focus-subcell-outline" />
            </Source>
          )}
          {/* Circles + labels always on top so mouse events work */}
          {!hexagonMode && (
            <Source type="geojson" data={geojsonData} id="clustered-map-source" key="clustered-map-source">
              <Layer {...eventPointLayer} />
              <Layer {...clusterLayer} />
              <Layer {...clusterLabelLayer} />
            </Source>
          )}
          {hexagonMode && (
            <Source type="geojson" data={geojsonData} id="clustered-map-source" key="clustered-map-source">
              <Layer {...eventPointLayer} />
            </Source>
          )}
          {popupInfo && (
            <Popup longitude={popupInfo.longitude} latitude={popupInfo.latitude} anchor="bottom" onClose={closePopup}>
              <div>{popupInfo.title}</div>
            </Popup>
          )}
        </MapGL>
        {/* Focus mode panel */}
        {focusedCluster && (
          <div className="absolute right-14 bottom-20 z-10">
            <ClusterFocusPanel
              count={focusedCluster.count}
              summary={clusterSummary}
              isLoading={clusterSummaryLoading ?? false}
              onZoomIn={handleZoomInFromPanel}
              onFilterToCluster={() => {
                const cells = focusedCluster.sourceCells ?? [focusedCluster.clusterId];
                useUIStore.getState().setClusterFilterCells(cells);
                clearFocusedCluster();
              }}
              onClose={clearFocusedCluster}
            />
          </div>
        )}
        {/* Cluster filter active indicator */}
        {clusterFilterCells && (
          <div className="absolute top-2 left-1/2 z-10 -translate-x-1/2">
            <div className="bg-primary/90 text-primary-foreground flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium shadow-md backdrop-blur-sm">
              <span>{t("clusterFilterActive")}</span>
              <button
                type="button"
                onClick={() => useUIStore.getState().setClusterFilterCells(null)}
                className="hover:bg-primary-foreground/20 rounded-full p-0.5 transition-colors"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }
);

ClusteredMap.displayName = "ClusteredMap";
