/**
 * Hook encapsulating H3 hover state and child-cell fetch logic.
 *
 * Manages hovering over H3 cluster features on the map — fetches and caches
 * child hex polygons for the hovered cluster, and clears state on leave.
 *
 * @module
 * @category Hooks
 */
"use client";

import type { MapMouseEvent } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";

import {
  buildHoverFetchParams,
  childFeaturesToHexPolygons,
  EMPTY_FEATURE_COLLECTION,
  resolveParentCells,
} from "./clustered-map-hex-data";

interface UseH3HoverProps {
  algorithm: string;
  currentZoom: number;
  mapRef: React.RefObject<MapRef | null>;
  isMapPositioned: boolean;
}

export const useH3Hover = ({ algorithm, currentZoom, mapRef, isMapPositioned }: UseH3HoverProps) => {
  const [hoverHexData, setHoverHexData] = useState<GeoJSON.FeatureCollection>(EMPTY_FEATURE_COLLECTION);
  const hoveredClusterIdRef = useRef<string | null>(null);
  const hoverCacheRef = useRef<Record<string, GeoJSON.Feature[]>>({});
  const hoverAbortRef = useRef<AbortController | null>(null);

  const handleH3Hover = useCallback(
    (e: { features?: Array<{ id?: string | number; properties?: Record<string, unknown> }> }) => {
      if (algorithm !== "h3") return;
      if (!e.features?.length) return;
      const feature = e.features[0];
      if (!feature) return;

      // Only show children for clusters, not individual event points
      if (feature.properties?.type !== "event-cluster") {
        if (hoveredClusterIdRef.current) {
          hoveredClusterIdRef.current = null;
          setHoverHexData(EMPTY_FEATURE_COLLECTION);
        }
        return;
      }

      // Skip if same cluster as last hover
      const clusterId = String((feature.properties?.clusterId ?? feature.id ?? "") as string | number);
      if (clusterId === hoveredClusterIdRef.current) return;
      hoveredClusterIdRef.current = clusterId;

      // Cancel any in-flight hover fetch
      hoverAbortRef.current?.abort();

      // Check cache first
      const cached = hoverCacheRef.current[clusterId];
      if (cached) {
        setHoverHexData({ type: "FeatureCollection", features: cached });
        return;
      }

      // Clear previous hover while loading
      setHoverHexData(EMPTY_FEATURE_COLLECTION);

      // Resolve parent cells for the API call
      const parentCells = resolveParentCells(feature.properties?.sourceCells, clusterId);
      if (parentCells.length === 0) return;

      // Fetch child cells with real events from the server
      const abort = new AbortController();
      hoverAbortRef.current = abort;
      const mapInstance = mapRef.current?.getMap();
      const params = buildHoverFetchParams(parentCells, currentZoom, mapInstance ? mapInstance.getBounds() : null);

      void fetch(`/api/v1/events/geo?${params}`, { signal: abort.signal })
        .then((r) => r.json())
        .then((data: { features?: Array<{ id?: string | number; properties?: Record<string, unknown> }> }) => {
          if (hoveredClusterIdRef.current !== clusterId) return undefined;
          const hexFeatures = childFeaturesToHexPolygons(data.features ?? []);
          hoverCacheRef.current[clusterId] = hexFeatures;
          setHoverHexData({ type: "FeatureCollection", features: hexFeatures });
          return undefined;
        })
        .catch(() => {
          /* aborted or error, ignore */
        });
    },
    [algorithm, currentZoom, mapRef]
  );

  const handleH3HoverLeave = useCallback(() => {
    hoveredClusterIdRef.current = null;
    hoverAbortRef.current?.abort();
    setHoverHexData(EMPTY_FEATURE_COLLECTION);
  }, []);

  // Hold latest hover handlers in refs so the mousemove listener below can
  // read them without tearing down and re-attaching on every zoom change.
  const handleH3HoverRef = useRef(handleH3Hover);
  const handleH3HoverLeaveRef = useRef(handleH3HoverLeave);
  handleH3HoverRef.current = handleH3Hover;
  handleH3HoverLeaveRef.current = handleH3HoverLeave;

  // Native mousemove handler to detect cluster hover across features
  // (react-map-gl's onMouseEnter only fires once per layer entry, not per feature)
  useEffect(() => {
    if (!isMapPositioned) return;
    const map = mapRef.current?.getMap();
    if (!map) return;

    const onMove = (e: MapMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["event-clusters"] });
      if (features.length > 0 && features[0]?.properties?.type === "event-cluster") {
        handleH3HoverRef.current({
          features: features as Array<{ id?: string | number; properties?: Record<string, unknown> }>,
        });
      } else if (hoveredClusterIdRef.current) {
        handleH3HoverLeaveRef.current();
      }
    };
    map.on("mousemove", onMove);

    return () => {
      map.off("mousemove", onMove);
    };
  }, [isMapPositioned, mapRef]);

  return { hoverHexData, handleH3Hover, handleH3HoverLeave };
};
