"use client";

import { useCallback, useMemo, useState, useEffect } from "react";
import Map, { Source, Layer, Popup, type MapRef } from "react-map-gl/maplibre";
import type { LngLatBounds } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { createLogger } from "../lib/logger";

interface ClusteredMapProps {
  onBoundsChange?: (bounds: LngLatBounds, zoom: number) => void;
  clusters?: any[]; // GeoJSON features from the clustering API
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
  const [currentBounds, setCurrentBounds] = useState<LngLatBounds | null>(null);

  const handleLoad = useCallback(
    (evt: any) => {
      const map = evt.target as MapRef;
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      setCurrentBounds(bounds);

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
      (window as any)._mapRef = map;

      // Trigger initial bounds change to load data
      if (onBoundsChange) {
        onBoundsChange(bounds, zoom);
      }
    },
    [onBoundsChange],
  );

  const handleClick = useCallback((event: any) => {
    const feature = event.features?.[0];
    if (!feature) return;

    const { type } = feature.properties;

    if (type === "event-cluster") {
      // Zoom in on cluster click
      const [longitude, latitude] = feature.geometry.coordinates;
      event.target.flyTo({
        center: [longitude, latitude],
        zoom: event.target.getZoom() + 2,
      });
    } else if (type === "event-point") {
      // Show popup for individual events
      const [longitude, latitude] = feature.geometry.coordinates;
      const { title, id } = feature.properties;
      setPopupInfo({
        longitude,
        latitude,
        title: title || `Event ${id}`,
      });
    }
  }, []);

  const geojsonData = useMemo(() => {
    const data = {
      type: "FeatureCollection" as const,
      features: clusters,
    };

    return data;
  }, [clusters]);

  const eventPointLayer: any = {
    id: "unclustered-point",
    type: "circle",
    // source: "all-features",
    filter: ["==", ["get", "type"], "event-point"],
    paint: {
      "circle-color": "#11b4da",
      "circle-radius": 6,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#fff",
    },
  };

  const clusterLayer: any = {
    id: "event-clusters",
    type: "circle",
    // source: "all-features",
    filter: ["==", ["get", "type"], "event-cluster"],
    paint: {
      "circle-radius": 30,
      "circle-color": "#ff6b6b",
      "circle-stroke-width": 3,
      "circle-stroke-color": "#ffffff",
    },
  };

  const clusterCountLayer: any = {
    id: "event-cluster-count",
    type: "symbol",
    // source: "all-features",
    filter: ["==", ["get", "type"], "event-cluster"],
    layout: {
      "text-field": ["to-string", ["get", "count"]],
      "text-size": 16,
      "text-font": ["Noto Sans Regular"], // Use font from OpenMapTiles
    },
    paint: {
      "text-color": "#ffffff",
      "text-halo-color": "#000000",
      "text-halo-width": 1,
    },
  };

  // Debug layer to show ALL features
  const debugLayer: any = {
    id: "debug-all-features",
    type: "circle",
    source: "all-features",
    paint: {
      "circle-radius": 25,
      "circle-color": "#ff0000", // Bright red
      "circle-opacity": 1.0, // Fully opaque
      "circle-stroke-width": 5,
      "circle-stroke-color": "#ffff00", // Yellow border
    },
  };

  const handleMove = useCallback(
    (evt: any) => {
      const map = evt.target as MapRef;
      const bounds = map.getBounds();
      const zoom = map.getZoom();
      setCurrentBounds(bounds);

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
