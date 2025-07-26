"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { LngLatBounds } from "maplibre-gl";
import { useCallback, useMemo, useState } from "react";
import Map, { Layer, type MapLayerMouseEvent, type MapRef, Popup, Source } from "react-map-gl/maplibre";

import { createLogger } from "../lib/logger";

export interface ClusterFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    id: string | number;
    type: "event-cluster" | "event-point";
    count?: number;
    title?: string;
    eventIds?: unknown[];
  };
}

interface ClusteredMapProps {
  onBoundsChange?: (bounds: LngLatBounds, zoom: number) => void;
  clusters?: ClusterFeature[];
}

const logger = createLogger("ClusteredMap");

const DEFAULT_CLUSTERS: ClusterFeature[] = [];
const INITIAL_VIEW_STATE = {
  longitude: -74.0,
  latitude: 40.6,
  zoom: 9,
};
const MAP_STYLE = { width: "100%", height: "100%", minHeight: "400px" };
const INTERACTIVE_LAYER_IDS = ["event-clusters", "unclustered-point"];

export const ClusteredMap = ({ onBoundsChange, clusters = DEFAULT_CLUSTERS }: Readonly<ClusteredMapProps>) => {
  const [popupInfo, setPopupInfo] = useState<{
    longitude: number;
    latitude: number;
    title: string;
  } | null>(null);

  const closePopup = useCallback(() => setPopupInfo(null), []);

  const handleLoad = useCallback(
    (evt: { target: { getBounds: () => LngLatBounds; getZoom: () => number } }) => {
      const map = evt.target as MapRef;
      const bounds = map.getBounds();
      const zoom = map.getZoom();

      logger.debug("Map initialized", {
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        },
        zoom: zoom,
        center: map.getCenter(),
      });

      // Store map reference for manual source management
      (window as { _mapRef?: unknown })._mapRef = map;

      // Trigger initial bounds change to load data
      if (onBoundsChange != undefined) {
        onBoundsChange(bounds, zoom);
      }
    },
    [onBoundsChange],
  );

  const getValidCoordinates = (feature: GeoJSON.Feature): [number, number] | null => {
    const coordinates = feature.geometry?.type === "Point" ? feature.geometry.coordinates : null;
    if (coordinates && coordinates.length >= 2) {
      const [lng, lat] = coordinates as [number, number];
      if (typeof lng === "number" && typeof lat === "number" && !isNaN(lng) && !isNaN(lat)) {
        return [lng, lat];
      }
    }
    return null;
  };

  const handleClusterClick = useCallback((event: MapLayerMouseEvent, feature: GeoJSON.Feature) => {
    const coordinates = getValidCoordinates(feature);
    if (coordinates) {
      const [longitude, latitude] = coordinates;
      event.target.flyTo({
        center: [longitude, latitude],
        zoom: event.target.getZoom() + 2,
      });
    }
  }, []);

  const handleEventPointClick = useCallback((feature: GeoJSON.Feature) => {
    const coordinates = getValidCoordinates(feature);
    if (coordinates) {
      const [longitude, latitude] = coordinates;
      const { title, id } = feature.properties ?? {};
      setPopupInfo({
        longitude,
        latitude,
        title: typeof title === "string" ? title : `Event ${String(id ?? "Unknown")}`,
      });
    }
  }, []);

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (feature == undefined || feature == null) return;

      const { type } = feature.properties ?? {};

      if (type === "event-cluster") {
        handleClusterClick(event, feature);
      } else if (type === "event-point") {
        handleEventPointClick(feature);
      }
    },
    [handleClusterClick, handleEventPointClick],
  );

  const geojsonData = useMemo(() => {
    return {
      type: "FeatureCollection" as const,
      features: clusters,
    };
  }, [clusters]);

  const eventPointFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-point"];
  const clusterFilter: ["==", ["get", string], string] = ["==", ["get", "type"], "event-cluster"];

  const eventPointLayer = {
    id: "unclustered-point",
    type: "circle" as const,
    filter: eventPointFilter,
    paint: {
      "circle-color": "#11b4da",
      "circle-radius": 6,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
    },
  };

  const clusterLayer = {
    id: "event-clusters",
    type: "circle" as const,
    filter: clusterFilter,
    paint: {
      "circle-radius": 30,
      "circle-color": "#ff6b6b",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
    },
  };

  const handleMove = useCallback(
    (evt: { target: { getBounds: () => LngLatBounds; getZoom: () => number } }) => {
      const map = evt.target as MapRef;
      const bounds = map.getBounds();
      const zoom = map.getZoom();

      logger.trace("Map viewport changed", {
        zoom,
        bounds: {
          north: bounds.getNorth(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          west: bounds.getWest(),
        },
      });

      if (onBoundsChange) {
        onBoundsChange(bounds, zoom);
      }
    },
    [onBoundsChange],
  );

  return (
    <Map
      initialViewState={INITIAL_VIEW_STATE}
      style={MAP_STYLE}
      mapStyle="https://tiles.versatiles.org/assets/styles/colorful/style.json"
      onMove={handleMove}
      onLoad={handleLoad}
      onClick={handleClick}
      interactiveLayerIds={INTERACTIVE_LAYER_IDS}
      cursor="auto"
    >
      <Source type="geojson" data={geojsonData} id="clustered-map-source" key={"clustered-map-source"}>
        <Layer {...eventPointLayer} />
        <Layer {...clusterLayer} />
      </Source>

      {popupInfo && (
        <Popup longitude={popupInfo.longitude} latitude={popupInfo.latitude} anchor="bottom" onClose={closePopup}>
          <div>{popupInfo.title}</div>
        </Popup>
      )}
    </Map>
  );
};
