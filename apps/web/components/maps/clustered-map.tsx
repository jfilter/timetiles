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
import { forwardRef, useImperativeHandle, useRef } from "react";
import Map, { Layer, type MapRef, NavigationControl, Popup, Source } from "react-map-gl/maplibre";

import { type ClusterStats, MAP_STYLES, MAP_STYLES_BY_PRESET } from "@/lib/constants/map";
import { useTheme } from "@/lib/hooks/use-theme";
import { useThemePreset } from "@/lib/hooks/use-theme-preset";
import type { SimpleBounds } from "@/lib/utils/event-params";

import {
  buildClusterLayerConfig,
  buildEventPointLayerConfig,
  computeGlobalStats,
  computeViewportStats,
  DEFAULT_CLUSTERS,
  fitMapToBounds,
  INITIAL_VIEW_STATE,
  INTERACTIVE_LAYER_IDS,
  logMapInitialized,
  logMapViewportChanged,
  MAP_COMPONENT_STYLE,
} from "./clustered-map-helpers";
import { MapErrorOverlay, MapLoadingOverlay } from "./map-overlays";
import { MapThemeControl } from "./map-theme-control";
import { useMapInteractions } from "./use-map-interactions";

export interface ClusterFeature {
  type: "Feature";
  id?: string | number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { type: "event-cluster" | "event-point"; count?: number; title?: string };
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
  clusters?: ClusterFeature[];
  clusterStats?: ClusterStats;
  initialBounds?: SimpleBounds | null;
  initialViewState?: MapViewState | null;
  isLoadingBounds?: boolean;
  isError?: boolean;
}

export interface ClusteredMapHandle {
  resize: () => void;
  fitBounds: (bounds: SimpleBounds, options?: { padding?: number; animate?: boolean }) => void;
}

export const ClusteredMap = forwardRef<ClusteredMapHandle, ClusteredMapProps>(
  (
    {
      onBoundsChange,
      clusters = DEFAULT_CLUSTERS,
      clusterStats,
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
    });

    useImperativeHandle(ref, () => ({
      resize: () => mapRef.current?.resize(),
      fitBounds: (bounds: SimpleBounds, options = {}) => {
        if (mapRef.current) fitMapToBounds(mapRef.current, bounds, options);
      },
    }));

    const globalStats = computeGlobalStats(clusterStats);
    const viewportStats = computeViewportStats(clusters);

    const handleLoad = (evt: {
      target: { getBounds: () => LngLatBounds; getZoom: () => number; getCenter: () => { lng: number; lat: number } };
    }) => {
      const map = evt.target as MapRef;

      // Use initialViewState if provided (URL position), otherwise fall back to initialBounds
      if (initialViewState) {
        map.flyTo({
          center: [initialViewState.longitude, initialViewState.latitude],
          zoom: initialViewState.zoom,
          animate: false,
        });
      } else if (initialBounds) {
        fitMapToBounds(map, initialBounds, { animate: false });
      }

      const { bounds, zoom } = logMapInitialized(map, !!initialBounds || !!initialViewState);
      const center = map.getCenter();
      onBoundsChange?.(bounds, zoom, { lng: center.lng, lat: center.lat });
    };

    const handleMoveEnd = (evt: {
      target: { getBounds: () => LngLatBounds; getZoom: () => number; getCenter: () => { lng: number; lat: number } };
    }) => {
      const map = evt.target as MapRef;
      const { bounds, zoom } = logMapViewportChanged(map);
      const center = map.getCenter();
      onBoundsChange?.(bounds, zoom, { lng: center.lng, lat: center.lat });
    };

    const geojsonData = { type: "FeatureCollection" as const, features: clusters };
    const eventPointFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-point"];
    const clusterFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-cluster"];
    const eventPointLayer = { ...buildEventPointLayerConfig(mapColors), filter: eventPointFilter };
    const clusterLayer = buildClusterLayerConfig(globalStats, viewportStats, clusterFilter, mapColors);

    return (
      <div className="relative h-full w-full">
        {isLoadingBounds && <MapLoadingOverlay message={t("loadingMapData")} />}
        {isError && !isLoadingBounds && (
          <MapErrorOverlay title={t("unableToLoadMapData")} subtitle={t("mapLoadError")} />
        )}
        <Map
          ref={mapRef}
          initialViewState={INITIAL_VIEW_STATE}
          style={MAP_COMPONENT_STYLE}
          mapStyle={mapStyleUrl}
          onMoveEnd={handleMoveEnd}
          onLoad={handleLoad}
          onClick={handleClick}
          interactiveLayerIds={INTERACTIVE_LAYER_IDS}
          cursor="auto"
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <div className="absolute bottom-2 left-2 z-10">
            <MapThemeControl />
          </div>
          <Source type="geojson" data={geojsonData} id="clustered-map-source" key="clustered-map-source">
            <Layer {...eventPointLayer} />
            <Layer {...clusterLayer} />
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
