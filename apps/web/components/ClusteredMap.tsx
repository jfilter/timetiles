"use client";

import { useCallback, useMemo, useState } from "react";
import Map, {
  Source,
  Layer,
  Popup,
  type MapRef,
  type MapLayerMouseEvent,
} from "react-map-gl/maplibre";
import type { LngLatBounds } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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

export function ClusteredMap({
  onBoundsChange,
  clusters = [],
}: ClusteredMapProps) {
  const [popupInfo, setPopupInfo] = useState<{
    longitude: number;
    latitude: number;
    title: string;
  } | null>(null);

  const handleLoad = useCallback(
    (evt: {
      target: { getBounds: () => LngLatBounds; getZoom: () => number };
    }) => {
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
      if (onBoundsChange) {
        onBoundsChange(bounds, zoom);
      }
    },
    [onBoundsChange],
  );

  const handleClick = useCallback((event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) return;

    const { type } = feature.properties || {};

    if (type === "event-cluster") {
      // Zoom in on cluster click
      const coordinates =
        feature.geometry?.type === "Point"
          ? feature.geometry.coordinates
          : null;
      if (
        coordinates &&
        Array.isArray(coordinates) &&
        coordinates.length >= 2
      ) {
        const longitude = coordinates[0] as number;
        const latitude = coordinates[1] as number;
        event.target.flyTo({
          center: [longitude, latitude],
          zoom: event.target.getZoom() + 2,
        });
      }
    } else if (type === "event-point") {
      // Show popup for individual events
      const coordinates =
        feature.geometry?.type === "Point"
          ? feature.geometry.coordinates
          : null;
      if (
        coordinates &&
        Array.isArray(coordinates) &&
        coordinates.length >= 2
      ) {
        const longitude = coordinates[0] as number;
        const latitude = coordinates[1] as number;
        const { title, id } = feature.properties || {};
        setPopupInfo({
          longitude,
          latitude,
          title: title || `Event ${id}`,
        });
      }
    }
  }, []);

  const geojsonData = useMemo(() => {
    const data = {
      type: "FeatureCollection" as const,
      features: clusters,
    };

    return data;
  }, [clusters]);

  const eventPointFilter: ["==", ["get", string], string] = [
    "==",
    ["get", "type"],
    "event-point",
  ];
  const clusterFilter: ["==", ["get", string], string] = [
    "==",
    ["get", "type"],
    "event-cluster",
  ];

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
    (evt: {
      target: { getBounds: () => LngLatBounds; getZoom: () => number };
    }) => {
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
      initialViewState={{
        longitude: -74.0,
        latitude: 40.6,
        zoom: 9,
      }}
      style={{ width: "100%", height: "100%", minHeight: "400px" }}
      mapStyle="https://tiles.versatiles.org/assets/styles/colorful/style.json"
      onMove={handleMove}
      onLoad={handleLoad}
      onClick={handleClick}
      interactiveLayerIds={["event-clusters", "unclustered-point"]}
      cursor="auto"
    >
      <Source
        type="geojson"
        data={geojsonData}
        id="clustered-map-source"
        key={"clustered-map-source"}
      >
        <Layer {...eventPointLayer} />
        <Layer {...clusterLayer} />
      </Source>

      {popupInfo && (
        <Popup
          longitude={popupInfo.longitude}
          latitude={popupInfo.latitude}
          anchor="bottom"
          onClose={() => setPopupInfo(null)}
        >
          <div>{popupInfo.title}</div>
        </Popup>
      )}
    </Map>
  );
}
