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

import type { LngLatBounds } from "maplibre-gl";
import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from "react";
import Map, { Layer, type MapLayerMouseEvent, type MapRef, Popup, Source } from "react-map-gl/maplibre";

import { createLogger } from "@/lib/logger";

export interface ClusterFeature {
  type: "Feature";
  id?: string | number;
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    type: "event-cluster" | "event-point";
    count?: number;
    title?: string;
  };
}

interface ClusterStats {
  p20: number;
  p40: number;
  p60: number;
  p80: number;
  p100: number;
}

interface ClusteredMapProps {
  onBoundsChange?: (bounds: LngLatBounds, zoom: number) => void;
  clusters?: ClusterFeature[];
  clusterStats?: ClusterStats;
}

/**
 * Handle for ClusteredMap ref to allow parent components to trigger resize.
 */
export interface ClusteredMapHandle {
  resize: () => void;
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

export const ClusteredMap = forwardRef<ClusteredMapHandle, ClusteredMapProps>(
  // eslint-disable-next-line sonarjs/max-lines-per-function -- Complex map component with extensive styling logic
  ({ onBoundsChange, clusters = DEFAULT_CLUSTERS, clusterStats: globalClusterStats }, ref) => {
    const [popupInfo, setPopupInfo] = useState<{
      longitude: number;
      latitude: number;
      title: string;
    } | null>(null);

    const mapRef = useRef<MapRef | null>(null);

    // Expose resize method to parent via ref
    useImperativeHandle(ref, () => ({
      resize: () => {
        mapRef.current?.resize();
      },
    }));

    // Global stats for consistent size/color across all views
    const globalStats = useMemo(() => {
      const rawStats = globalClusterStats ?? { p20: 2, p40: 5, p60: 10, p80: 20, p100: 50 };

      // Ensure strictly ascending order for MapLibre step expressions
      const stats = {
        p20: rawStats.p20,
        p40: 0,
        p60: 0,
        p80: 0,
        p100: 0,
      };
      stats.p40 = Math.max(rawStats.p40, stats.p20 + 1);
      stats.p60 = Math.max(rawStats.p60, stats.p40 + 1);
      stats.p80 = Math.max(rawStats.p80, stats.p60 + 1);
      stats.p100 = Math.max(rawStats.p100, stats.p80 + 1);

      logger.debug("Global cluster stats for size/color", {
        rawStats,
        stats,
      });

      return stats;
    }, [globalClusterStats]);

    // Viewport-relative stats for opacity (shows density within current view)
    const viewportStats = useMemo(() => {
      if (clusters.length === 0) {
        return { p20: 2, p40: 5, p60: 10, p80: 20, p100: 50 };
      }

      const counts = clusters
        .map((c) => c.properties.count ?? 1)
        .filter((count) => count > 1) // Only consider actual clusters, not individual points
        .sort((a, b) => a - b);

      if (counts.length === 0) {
        return { p20: 2, p40: 5, p60: 10, p80: 20, p100: 50 };
      }

      const getPercentile = (arr: number[], percentile: number) => {
        const index = Math.ceil((percentile / 100) * arr.length) - 1;
        return arr[Math.max(0, index)];
      };

      const rawStats = {
        p20: getPercentile(counts, 20),
        p40: getPercentile(counts, 40),
        p60: getPercentile(counts, 60),
        p80: getPercentile(counts, 80),
        p100: Math.max(...counts),
      };

      // Ensure strictly ascending order for MapLibre step expressions
      const stats = {
        p20: rawStats.p20 ?? 2,
        p40: 0,
        p60: 0,
        p80: 0,
        p100: 0,
      };
      stats.p40 = Math.max(rawStats.p40 ?? 5, stats.p20 + 1);
      stats.p60 = Math.max(rawStats.p60 ?? 10, stats.p40 + 1);
      stats.p80 = Math.max(rawStats.p80 ?? 20, stats.p60 + 1);
      stats.p100 = Math.max(rawStats.p100 ?? 50, stats.p80 + 1);

      logger.debug("Viewport cluster percentiles for opacity", {
        totalClusters: clusters.length,
        clusterCounts: counts.length,
        rawStats,
        stats,
      });

      return stats;
    }, [clusters]);

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
      [onBoundsChange]
    );

    const getValidCoordinates = (feature: GeoJSON.Feature): [number, number] | null => {
      const coordinates = feature.geometry?.type === "Point" ? feature.geometry.coordinates : null;
      if (coordinates && coordinates.length >= 2) {
        const [lng, lat] = coordinates as [number, number];
        if (typeof lng === "number" && typeof lat === "number" && !Number.isNaN(lng) && !Number.isNaN(lat)) {
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
        const { title } = feature.properties ?? {};
        const featureId = feature.id;
        setPopupInfo({
          longitude,
          latitude,
          title: typeof title === "string" ? title : `Event ${String(featureId ?? "Unknown")}`,
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
      [handleClusterClick, handleEventPointClick]
    );

    const geojsonData = useMemo(() => {
      return {
        type: "FeatureCollection" as const,
        features: clusters,
      };
    }, [clusters]);

    const eventPointFilter: ["==", ["get", string], string] = useMemo(() => ["==", ["get", "type"], "event-point"], []);
    const clusterFilter: ["==", ["get", string], string] = useMemo(() => ["==", ["get", "type"], "event-cluster"], []);

    const eventPointLayer = {
      id: "unclustered-point",
      type: "circle" as const,
      filter: eventPointFilter,
      paint: {
        "circle-color": "#8b5cf6",
        "circle-radius": 6,
        "circle-opacity": 1,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#fff",
      },
    };

    const clusterLayer = useMemo(
      () => ({
        id: "event-clusters",
        type: "circle" as const,
        filter: clusterFilter,
        paint: {
          // Size based on GLOBAL percentiles (consistent across all views)
          "circle-radius": [
            "step",
            ["get", "count"],
            16, // Default: very small (0-p20)
            globalStats.p20,
            22, // Level 2: small (p20-p40)
            globalStats.p40,
            28, // Level 3: medium (p40-p60)
            globalStats.p60,
            34, // Level 4: large (p60-p80)
            globalStats.p80,
            40, // Level 5: max size (p80-p100)
          ],
          // Color based on GLOBAL percentiles (consistent across all views)
          "circle-color": [
            "step",
            ["get", "count"],
            "#ffcccc", // Level 1: very light red/pink (0-p20)
            globalStats.p20,
            "#ff9999", // Level 2: light red (p20-p40)
            globalStats.p40,
            "#ff6666", // Level 3: medium red (p40-p60)
            globalStats.p60,
            "#ff3333", // Level 4: dark red (p60-p80)
            globalStats.p80,
            "#cc0000", // Level 5: very dark red/crimson (p80-p100)
          ],
          // Opacity based on VIEWPORT percentiles (shows relative density in current view)
          "circle-opacity": [
            "step",
            ["get", "count"],
            0.3, // Level 1: light (0-p20)
            viewportStats.p20,
            0.45, // Level 2: medium-light (p20-p40)
            viewportStats.p40,
            0.6, // Level 3: medium (p40-p60)
            viewportStats.p60,
            0.75, // Level 4: medium-high (p60-p80)
            viewportStats.p80,
            0.9, // Level 5: max opacity (p80-p100)
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
          "circle-stroke-opacity": 0.8,
        },
      }),
      [globalStats, viewportStats, clusterFilter]
    );

    const handleMoveEnd = useCallback(
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
      [onBoundsChange]
    );

    return (
      <Map
        ref={mapRef}
        initialViewState={INITIAL_VIEW_STATE}
        style={MAP_STYLE}
        mapStyle="https://tiles.versatiles.org/assets/styles/colorful/style.json"
        onMoveEnd={handleMoveEnd}
        onLoad={handleLoad}
        onClick={handleClick}
        interactiveLayerIds={INTERACTIVE_LAYER_IDS}
        cursor="auto"
      >
        <Source type="geojson" data={geojsonData} id="clustered-map-source" key="clustered-map-source">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Layer {...(eventPointLayer as any)} />
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <Layer {...(clusterLayer as any)} />
        </Source>

        {popupInfo && (
          <Popup longitude={popupInfo.longitude} latitude={popupInfo.latitude} anchor="bottom" onClose={closePopup}>
            <div>{popupInfo.title}</div>
          </Popup>
        )}
      </Map>
    );
  }
);

ClusteredMap.displayName = "ClusteredMap";
