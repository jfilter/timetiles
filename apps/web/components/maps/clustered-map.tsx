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
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";

import { MAP_STYLES, MAP_STYLES_BY_PRESET } from "@/lib/constants/map";
import { useTheme } from "@/lib/hooks/use-theme";
import { useThemePreset } from "@/lib/hooks/use-theme-preset";
import type { ClusterSummaryResponse } from "@/lib/schemas/events";
import type { SimpleBounds, ViewScope } from "@/lib/utils/event-params";

import { DEFAULT_CLUSTERS, fitMapToBounds, INITIAL_VIEW_STATE } from "./clustered-map-helpers";
import { ClusteredMapRenderer } from "./clustered-map-renderer";
import { useClusterLayers } from "./use-cluster-layers";
import { useClusterState } from "./use-cluster-state";
import { useFocusHandlers } from "./use-focus-handlers";
import { useH3Hover } from "./use-h3-hover";
import { useMapBounds } from "./use-map-bounds";
import { useMapInteractions } from "./use-map-interactions";

export interface ClusterFeature {
  type: "Feature";
  id?: string | number;
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    type: "event-cluster" | "event-location";
    count?: number;
    clusterId?: string;
    eventId?: number;
    title?: string;
    extentRadius?: number;
    sourceCells?: string[];
    h3Cell?: string;
    locationName?: string;
    locationCount?: number;
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
  scope?: ViewScope;
}

export interface ClusteredMapHandle {
  resize: () => void;
  fitBounds: (bounds: SimpleBounds, options?: { padding?: number; animate?: boolean }) => void;
}

type MapDiagnosticsGlobal = typeof globalThis & { __TIMETILES_E2E_MAP__?: MapRef };

const exposeMapForLocalDiagnostics = (map: MapRef): void => {
  const host = globalThis.location?.hostname;
  if (host !== "localhost" && host !== "127.0.0.1") return;

  (globalThis as MapDiagnosticsGlobal).__TIMETILES_E2E_MAP__ = map;
};

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
      scope,
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

    const {
      algorithm,
      showHex,
      hexagonMode,
      clusterFilterCells,
      focusedCluster,
      highlightedCells,
      animatedClusters,
      geojsonData,
      maxCount,
    } = useClusterState(clusters);

    const { isMapPositioned, handleLoad, handleMoveEnd } = useMapBounds({
      initialBounds,
      initialViewState,
      onBoundsChange,
      mapRef,
      setCurrentZoom,
    });
    const handleLoadWithDiagnostics: typeof handleLoad = (event) => {
      handleLoad(event);
      exposeMapForLocalDiagnostics(event.target as MapRef);
    };
    const { hoverHexData, handleH3Hover, handleH3HoverLeave } = useH3Hover({
      algorithm,
      currentZoom,
      mapRef,
      isMapPositioned,
      scope,
    });

    useImperativeHandle(ref, () => ({
      resize: () => mapRef.current?.resize(),
      fitBounds: (bounds: SimpleBounds, options = {}) => {
        if (mapRef.current) fitMapToBounds(mapRef.current, bounds, options);
      },
    }));

    const {
      locationLayer,
      locationLabelLayer,
      clusterLayer,
      clusterLabelLayer,
      h3HexData,
      mergeGroupData,
      focusHexData,
      focusSubcellHexData,
    } = useClusterLayers({
      algorithm,
      animatedClusters,
      mapColors,
      maxCount,
      highlightedCells,
      focusedCluster,
      clusterChildren,
    });
    const { handleDblClick, handleZoomInFromPanel } = useFocusHandlers({
      focusedCluster,
      mapRef,
      handleFocusedClusterZoom,
      clearFocusedCluster,
    });

    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- intentional: false must also fall through
    const showLoading = isLoadingBounds || !isMapPositioned;

    return (
      <ClusteredMapRenderer
        mapRef={mapRef}
        mapStyleUrl={mapStyleUrl}
        mapColors={mapColors}
        maxCount={maxCount}
        hexagonMode={hexagonMode}
        algorithm={algorithm}
        showHex={showHex}
        clusterFilterCells={clusterFilterCells}
        focusedCluster={focusedCluster}
        showLoading={showLoading}
        isError={isError}
        geojsonData={geojsonData}
        h3HexData={h3HexData}
        mergeGroupData={mergeGroupData}
        hoverHexData={hoverHexData}
        focusHexData={focusHexData}
        focusSubcellHexData={focusSubcellHexData}
        locationLayer={locationLayer}
        locationLabelLayer={locationLabelLayer}
        clusterLayer={clusterLayer}
        clusterLabelLayer={clusterLabelLayer}
        popupInfo={popupInfo}
        clusterSummary={clusterSummary}
        clusterSummaryLoading={clusterSummaryLoading}
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoadWithDiagnostics}
        onClick={handleClick}
        onDblClick={handleDblClick}
        onMouseEnter={handleH3Hover}
        onMouseLeave={handleH3HoverLeave}
        onClosePopup={closePopup}
        onZoomIn={handleZoomInFromPanel}
        onClose={clearFocusedCluster}
        loadingMessage={t("loadingMapData")}
        errorTitle={t("unableToLoadMapData")}
        errorSubtitle={t("mapLoadError")}
        filterLabel={t("clusterFilterActive")}
        initialViewState={initialViewState}
      />
    );
  }
);

ClusteredMap.displayName = "ClusteredMap";
