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
/* eslint-disable sonarjs/max-lines-per-function -- Map setup requires many sequential configuration steps */
"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import { ContentState } from "@timetiles/ui";
import { Loader2 } from "lucide-react";
import type { LngLatBounds } from "maplibre-gl";
import { useTranslations } from "next-intl";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import Map, {
  Layer,
  type MapLayerMouseEvent,
  type MapRef,
  NavigationControl,
  Popup,
  Source,
} from "react-map-gl/maplibre";

import { type ClusterStats, MAP_STYLES } from "@/lib/constants/map";
import { useTheme } from "@/lib/hooks/use-theme";
import type { SimpleBounds } from "@/lib/utils/event-params";

import {
  buildClusterLayerConfig,
  computeGlobalStats,
  computeViewportStats,
  DEFAULT_CLUSTERS,
  eventPointLayerConfig,
  fitMapToBounds,
  getValidCoordinates,
  INITIAL_VIEW_STATE,
  INTERACTIVE_LAYER_IDS,
  logMapInitialized,
  logMapViewportChanged,
  MAP_COMPONENT_STYLE,
} from "./clustered-map-helpers";
import { MapThemeControl } from "./map-theme-control";

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

/** Error overlay shown when map data fails to load */
const MapErrorOverlay = ({ title, subtitle }: { title: string; subtitle: string }) => (
  <div className="bg-background/60 pointer-events-auto absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm">
    <ContentState variant="error" title={title} subtitle={subtitle} />
  </div>
);

/** Loading overlay shown while computing initial bounds */
const MapLoadingOverlay = ({ message }: { message: string }) => (
  <div className="bg-background/60 pointer-events-auto absolute inset-0 z-20 flex items-center justify-center backdrop-blur-sm">
    <div className="flex flex-col items-center gap-3">
      <Loader2 className="text-primary h-8 w-8 animate-spin" />
      <span className="text-muted-foreground text-sm font-medium">{message}</span>
    </div>
  </div>
);

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
    const [popupInfo, setPopupInfo] = useState<{ longitude: number; latitude: number; title: string } | null>(null);
    const mapRef = useRef<MapRef | null>(null);
    const mapStyleUrl = MAP_STYLES[resolvedTheme];
    const closePopup = () => setPopupInfo(null);

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

    const handleClusterClick = (event: MapLayerMouseEvent, feature: GeoJSON.Feature) => {
      const coordinates = getValidCoordinates(feature);
      if (coordinates) {
        event.target.flyTo({ center: coordinates, zoom: event.target.getZoom() + 2 });
      }
    };

    const handleEventPointClick = (feature: GeoJSON.Feature) => {
      const coordinates = getValidCoordinates(feature);
      if (coordinates) {
        const { title } = feature.properties ?? {};
        setPopupInfo({
          longitude: coordinates[0],
          latitude: coordinates[1],
          title: typeof title === "string" ? title : t("eventFallbackTitle", { id: String(feature.id ?? "Unknown") }),
        });
      }
    };

    const handleClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const { type } = feature.properties ?? {};
      if (type === "event-cluster") handleClusterClick(event, feature);
      else if (type === "event-point") handleEventPointClick(feature);
    };

    const geojsonData = { type: "FeatureCollection" as const, features: clusters };
    const eventPointFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-point"];
    const clusterFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-cluster"];
    const eventPointLayer = { ...eventPointLayerConfig, filter: eventPointFilter };
    const clusterLayer = buildClusterLayerConfig(globalStats, viewportStats, clusterFilter);

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
