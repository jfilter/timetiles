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
import type { LngLatBounds } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { cellToBoundary, isValidCell } from "h3-js";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import Map, { Layer, type MapRef, NavigationControl, Popup, Source } from "react-map-gl/maplibre";

import { MAP_STYLES, MAP_STYLES_BY_PRESET } from "@/lib/constants/map";
import { useTheme } from "@/lib/hooks/use-theme";
import { useThemePreset } from "@/lib/hooks/use-theme-preset";
import type { SimpleBounds } from "@/lib/utils/event-params";

import {
  buildClusterLayerConfig,
  buildClusterLabelLayerConfig,
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
import { useUIStore } from "@/lib/store";

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

export const ClusteredMap = forwardRef<ClusteredMapHandle, ClusteredMapProps>(
  (
    {
      onBoundsChange,
      onEventClick,
      clusters = DEFAULT_CLUSTERS,
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
    const { popupInfo, closePopup, handleClick } = useMapInteractions({
      formatFallbackTitle: (id) => t("eventFallbackTitle", { id }),
      onEventClick,
    });

    const algorithm = useUIStore((s) => s.ui.clusterAlgorithm);
    const showHex = useUIStore((s) => s.ui.showHexBoundaries);

    // H3 hover state: hexagon cells to highlight
    const [hoverHexData, setHoverHexData] = useState<{
      type: "FeatureCollection";
      features: Array<{
        type: "Feature";
        properties: { intensity: number; count: number };
        geometry: { type: "Polygon"; coordinates: [Array<[number, number]>] };
      }>;
    }>({ type: "FeatureCollection", features: [] });

    const handleH3Hover = useCallback(
      (e: { features?: Array<{ id?: string | number; properties?: Record<string, unknown> }> }) => {
        if (algorithm !== "h3" || !e.features?.length) return;
        const feature = e.features[0];
        if (!feature) return;
        const id = String(feature.id ?? "");
        if (!id || id.length < 5) return;

        try {
          // For now: single cell = the cluster's own cell
          // TODO: when sourceCells is available, show all source cells
          if (!isValidCell(id)) return;
          const boundary = cellToBoundary(id);
          const coords = boundary.map(([lat, lng]) => [lng, lat] as [number, number]);
          if (coords.length > 0) coords.push(coords[0]!);

          setHoverHexData({
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                properties: { intensity: 1, count: Number(feature.properties?.count ?? 1) },
                geometry: { type: "Polygon", coordinates: [coords] },
              },
            ],
          });
        } catch {
          // Invalid cell, ignore
        }
      },
      [algorithm]
    );

    const handleH3HoverLeave = useCallback(() => {
      setHoverHexData({ type: "FeatureCollection", features: [] });
    }, []);

    const hasAppliedBoundsRef = useRef(false);
    const [isMapPositioned, setIsMapPositioned] = useState(!!initialViewState);

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
      const center = map.getCenter();
      onBoundsChange?.(bounds, zoom, { lng: center.lng, lat: center.lat });
    };

    const h3Animated = useH3Transition(algorithm === "h3" ? clusters : DEFAULT_CLUSTERS);
    const genericAnimated = useClusterTransition(algorithm !== "h3" ? clusters : DEFAULT_CLUSTERS);
    const animatedClusters = algorithm === "h3" ? h3Animated : genericAnimated;
    const geojsonData = { type: "FeatureCollection" as const, features: animatedClusters };
    const maxCount = useMemo(
      () => animatedClusters.reduce((max, f) => Math.max(max, f.properties.count ?? 1), 1),
      [animatedClusters]
    );
    const eventPointFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-point"];
    const clusterFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-cluster"];
    const eventPointLayer = { ...buildEventPointLayerConfig(mapColors), filter: eventPointFilter };
    const clusterLayer = buildClusterLayerConfig(clusterFilter, mapColors, maxCount);
    const clusterLabelLayer = buildClusterLabelLayerConfig(clusterFilter);

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
    const h3FillLayer = buildH3FillLayerConfig(mapColors, maxCount);
    const h3OutlineLayer = buildH3OutlineLayerConfig(mapColors);
    const h3HoverFillLayer = buildH3HoverFillLayerConfig();
    const h3HoverOutlineLayer = buildH3HoverOutlineLayerConfig();

    // Show loading overlay until map is positioned (opaque overlay hides default position)
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentional: false must also fall through
    const showLoading = isLoadingBounds || !isMapPositioned;

    return (
      <div className="relative h-full w-full">
        {showLoading && <MapLoadingOverlay message={t("loadingMapData")} />}
        {isError && !showLoading && <MapErrorOverlay title={t("unableToLoadMapData")} subtitle={t("mapLoadError")} />}
        <Map
          ref={mapRef}
          initialViewState={INITIAL_VIEW_STATE}
          style={MAP_COMPONENT_STYLE}
          mapStyle={mapStyleUrl}
          onMoveEnd={handleMoveEnd}
          onLoad={handleLoad}
          onClick={handleClick}
          onMouseEnter={handleH3Hover}
          onMouseLeave={handleH3HoverLeave}
          interactiveLayerIds={INTERACTIVE_LAYER_IDS}
          cursor="auto"
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1.5">
            <MapPreferencesControl />
          </div>
          {algorithm === "h3" && showHex && h3HexData.features.length > 0 && (
            <Source type="geojson" data={h3HexData} id="h3-hex-source">
              <Layer {...h3FillLayer} />
              <Layer {...h3OutlineLayer} />
            </Source>
          )}
          {algorithm === "h3" && hoverHexData.features.length > 0 && (
            <Source type="geojson" data={hoverHexData} id="h3-hover-source">
              <Layer {...h3HoverFillLayer} />
              <Layer {...h3HoverOutlineLayer} />
            </Source>
          )}
          <Source type="geojson" data={geojsonData} id="clustered-map-source" key="clustered-map-source">
            <Layer {...eventPointLayer} />
            <Layer {...clusterLayer} />
            <Layer {...clusterLabelLayer} />
          </Source>
          {popupInfo && (
            <Popup longitude={popupInfo.longitude} latitude={popupInfo.latitude} anchor="bottom" onClose={closePopup}>
              <div>{popupInfo.title}</div>
            </Popup>
          )}
        </Map>
      </div>
    );
  }
);

ClusteredMap.displayName = "ClusteredMap";
