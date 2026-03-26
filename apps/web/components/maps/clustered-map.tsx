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
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import Map, { Layer, type MapRef, NavigationControl, Popup, Source } from "react-map-gl/maplibre";

import { MAP_STYLES, MAP_STYLES_BY_PRESET } from "@/lib/constants/map";
import { useTheme } from "@/lib/hooks/use-theme";
import { useThemePreset } from "@/lib/hooks/use-theme-preset";
import type { SimpleBounds } from "@/lib/utils/event-params";

import { ClusterDensityControl } from "./cluster-density-control";
import {
  buildClusterLayerConfig,
  buildEventPointLayerConfig,
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
import { useMapInteractions } from "./use-map-interactions";

export interface ClusterFeature {
  type: "Feature";
  id?: string | number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: { type: "event-cluster" | "event-point"; count?: number; title?: string; extentRadius?: number };
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
  ({ onBoundsChange, clusters = DEFAULT_CLUSTERS, initialBounds, initialViewState, isLoadingBounds, isError }, ref) => {
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

    const geojsonData = { type: "FeatureCollection" as const, features: clusters };
    const eventPointFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-point"];
    const clusterFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-cluster"];
    const eventPointLayer = { ...buildEventPointLayerConfig(mapColors), filter: eventPointFilter };
    const clusterLayer = buildClusterLayerConfig(clusterFilter, mapColors);

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
          interactiveLayerIds={INTERACTIVE_LAYER_IDS}
          cursor="auto"
        >
          <NavigationControl position="bottom-right" showCompass={false} />
          <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1.5">
            <ClusterDensityControl />
            <MapPreferencesControl />
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
