/**
 * Stateless render component for ClusteredMap.
 *
 * Accepts all resolved props from the ClusteredMap forwardRef wrapper and
 * renders the map canvas, hex layers, cluster circles, popup, and overlay
 * panels. Extracted to keep the ClusteredMap function body within the
 * sonarjs/max-lines-per-function limit.
 *
 * @module
 * @category Components
 */
"use client";

import type { MapColors } from "@timetiles/ui/lib/chart-themes";
import type { MapLayerMouseEvent } from "maplibre-gl";
import type { ComponentProps } from "react";
import type { MapRef } from "react-map-gl/maplibre";
import MapGL, { Layer, NavigationControl, Popup, Source } from "react-map-gl/maplibre";

import type { ClusterSummaryResponse } from "@/lib/schemas/events";
import type { FocusedCluster } from "@/lib/store";

import { INITIAL_VIEW_STATE, INTERACTIVE_LAYER_IDS, MAP_COMPONENT_STYLE } from "./clustered-map-helpers";
import { MapClusterOverlays } from "./map-cluster-overlays";
import { MapHexSources } from "./map-hex-sources";
import { MapErrorOverlay, MapLoadingOverlay } from "./map-overlays";
import { MapPreferencesControl } from "./map-preferences-control";

// ---------------------------------------------------------------------------
// ClusterMapSources — renders the circle / label sources inside the map
// ---------------------------------------------------------------------------

interface ClusterMapSourcesProps {
  geojsonData: GeoJSON.FeatureCollection;
  hexagonMode: boolean;
  locationLayer: object;
  locationLabelLayer: object;
  clusterLayer: object;
  clusterLabelLayer: object;
}

const ClusterMapSources = ({
  geojsonData,
  hexagonMode,
  locationLayer,
  locationLabelLayer,
  clusterLayer,
  clusterLabelLayer,
}: ClusterMapSourcesProps) => (
  <Source type="geojson" data={geojsonData} id="clustered-map-source" key="clustered-map-source">
    <Layer {...(locationLayer as Parameters<typeof Layer>[0])} />
    <Layer {...(locationLabelLayer as Parameters<typeof Layer>[0])} />
    {!hexagonMode && <Layer {...(clusterLayer as Parameters<typeof Layer>[0])} />}
    {!hexagonMode && <Layer {...(clusterLabelLayer as Parameters<typeof Layer>[0])} />}
  </Source>
);

// ---------------------------------------------------------------------------
// ClusteredMapRenderer props
// ---------------------------------------------------------------------------

interface PopupInfo {
  longitude: number;
  latitude: number;
  title: string;
}

export interface ClusteredMapRendererProps {
  mapRef: React.RefObject<MapRef | null>;
  mapStyleUrl: string;
  mapColors: MapColors;
  maxCount: number;
  hexagonMode: boolean;
  algorithm: string;
  showHex: boolean;
  clusterFilterCells: string[] | null;
  focusedCluster: FocusedCluster | null;
  showLoading: boolean;
  isError?: boolean;
  geojsonData: GeoJSON.FeatureCollection;
  h3HexData: GeoJSON.FeatureCollection;
  mergeGroupData: GeoJSON.FeatureCollection;
  hoverHexData: GeoJSON.FeatureCollection;
  focusHexData: GeoJSON.FeatureCollection;
  focusSubcellHexData: GeoJSON.FeatureCollection;
  locationLayer: object;
  locationLabelLayer: object;
  clusterLayer: object;
  clusterLabelLayer: object;
  popupInfo: PopupInfo | null;
  clusterSummary?: ClusterSummaryResponse;
  clusterSummaryLoading?: boolean;
  // event handlers
  onMoveEnd: NonNullable<ComponentProps<typeof MapGL>["onMoveEnd"]>;
  onLoad: NonNullable<ComponentProps<typeof MapGL>["onLoad"]>;
  onClick: (event: MapLayerMouseEvent) => void;
  onDblClick: (event: MapLayerMouseEvent) => void;
  onMouseEnter: (e: { features?: Array<{ id?: string | number; properties?: Record<string, unknown> }> }) => void;
  onMouseLeave: () => void;
  onClosePopup: () => void;
  onZoomIn: () => void;
  onClose: () => void;
  loadingMessage: string;
  errorTitle: string;
  errorSubtitle: string;
  filterLabel: string;
  /**
   * URL-derived initial view state (lat/lng/zoom from ?lat=&lng=&zoom=).
   * When provided, MapGL initializes at this position — otherwise it
   * falls back to the hardcoded global default.
   */
  initialViewState?: { latitude: number; longitude: number; zoom: number } | null;
}

// ---------------------------------------------------------------------------
// ClusteredMapRenderer
// ---------------------------------------------------------------------------

export const ClusteredMapRenderer = ({
  mapRef,
  mapStyleUrl,
  mapColors,
  maxCount,
  hexagonMode,
  algorithm,
  showHex,
  clusterFilterCells,
  focusedCluster,
  showLoading,
  isError,
  geojsonData,
  h3HexData,
  mergeGroupData,
  hoverHexData,
  focusHexData,
  focusSubcellHexData,
  locationLayer,
  locationLabelLayer,
  clusterLayer,
  clusterLabelLayer,
  popupInfo,
  clusterSummary,
  clusterSummaryLoading,
  onMoveEnd,
  onLoad,
  onClick,
  onDblClick,
  onMouseEnter,
  onMouseLeave,
  onClosePopup,
  onZoomIn,
  onClose,
  loadingMessage,
  errorTitle,
  errorSubtitle,
  filterLabel,
  initialViewState,
}: ClusteredMapRendererProps) => (
  <div className="relative h-full w-full">
    {showLoading && <MapLoadingOverlay message={loadingMessage} />}
    {isError && !showLoading && <MapErrorOverlay title={errorTitle} subtitle={errorSubtitle} />}
    <MapGL
      ref={mapRef}
      initialViewState={initialViewState ?? INITIAL_VIEW_STATE}
      style={MAP_COMPONENT_STYLE}
      mapStyle={mapStyleUrl}
      onMoveEnd={onMoveEnd}
      onLoad={onLoad}
      onClick={onClick}
      onDblClick={onDblClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      interactiveLayerIds={INTERACTIVE_LAYER_IDS}
    >
      <NavigationControl position="bottom-right" showCompass={false} />
      <div className="absolute bottom-2 left-2 z-10 flex flex-col gap-1.5">
        <MapPreferencesControl />
      </div>
      <MapHexSources
        mapColors={mapColors}
        maxCount={maxCount}
        hexagonMode={hexagonMode}
        algorithm={algorithm}
        showHex={showHex}
        h3HexData={h3HexData}
        mergeGroupData={mergeGroupData}
        hoverHexData={hoverHexData}
        focusedCluster={focusedCluster}
        focusHexData={focusHexData}
        focusSubcellHexData={focusSubcellHexData}
      />
      <ClusterMapSources
        geojsonData={geojsonData}
        hexagonMode={hexagonMode}
        locationLayer={locationLayer}
        locationLabelLayer={locationLabelLayer}
        clusterLayer={clusterLayer}
        clusterLabelLayer={clusterLabelLayer}
      />
      {popupInfo && (
        <Popup longitude={popupInfo.longitude} latitude={popupInfo.latitude} anchor="bottom" onClose={onClosePopup}>
          <div>{popupInfo.title}</div>
        </Popup>
      )}
    </MapGL>
    <MapClusterOverlays
      focusedCluster={focusedCluster}
      clusterSummary={clusterSummary}
      clusterSummaryLoading={clusterSummaryLoading}
      clusterFilterCells={clusterFilterCells}
      onZoomIn={onZoomIn}
      onClose={onClose}
      filterLabel={filterLabel}
    />
  </div>
);
