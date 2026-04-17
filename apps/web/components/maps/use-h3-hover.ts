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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";

import { useH3HoverChildrenQuery } from "@/lib/hooks/use-events-queries";

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

interface HoverTarget {
  clusterId: string;
  parentCells: string[];
  boundsKey: string;
}

const boundsToKey = (
  bounds: { getNorth: () => number; getSouth: () => number; getEast: () => number; getWest: () => number } | null
): string => {
  if (!bounds) return "none";
  // Round to 4 decimals to avoid thrashing the cache on tiny pan deltas.
  const round = (n: number) => Math.round(n * 10000) / 10000;
  return `${round(bounds.getNorth())},${round(bounds.getSouth())},${round(bounds.getEast())},${round(bounds.getWest())}`;
};

export const useH3Hover = ({ algorithm, currentZoom, mapRef, isMapPositioned }: UseH3HoverProps) => {
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const roundedZoom = Math.round(currentZoom);

  // Build URL params lazily when the query runs — captures the latest bounds/zoom
  // at fetch time, matching the prior behavior.
  const buildParams = useCallback(() => {
    const mapInstance = mapRef.current?.getMap();
    const bounds = mapInstance ? mapInstance.getBounds() : null;
    const cells = hoverTarget?.parentCells ?? [];
    return buildHoverFetchParams(cells, currentZoom, bounds);
  }, [mapRef, currentZoom, hoverTarget]);

  const { data: childFeatures } = useH3HoverChildrenQuery(
    hoverTarget?.clusterId ?? null,
    hoverTarget?.parentCells ?? [],
    roundedZoom,
    hoverTarget?.boundsKey ?? "",
    buildParams,
    algorithm === "h3"
  );

  // Derive hex polygon GeoJSON from the query result. Falls back to empty
  // collection when no cluster is hovered or data hasn't loaded yet.
  const hoverHexData = useMemo<GeoJSON.FeatureCollection>(() => {
    if (!hoverTarget || !childFeatures) return EMPTY_FEATURE_COLLECTION;
    return { type: "FeatureCollection", features: childFeaturesToHexPolygons(childFeatures) };
  }, [hoverTarget, childFeatures]);

  const handleH3Hover = useCallback(
    (e: { features?: Array<{ id?: string | number; properties?: Record<string, unknown> }> }) => {
      if (algorithm !== "h3") return;
      if (!e.features?.length) return;
      const feature = e.features[0];
      if (!feature) return;

      // Only show children for clusters, not individual event points
      if (feature.properties?.type !== "event-cluster") {
        setHoverTarget((prev) => (prev === null ? prev : null));
        return;
      }

      const clusterId = String((feature.properties?.clusterId ?? feature.id ?? "") as string | number);
      // Skip if same cluster as last hover
      if (clusterId === hoverTarget?.clusterId) return;

      // Resolve parent cells for the API call
      const parentCells = resolveParentCells(feature.properties?.sourceCells, clusterId);
      if (parentCells.length === 0) return;

      const mapInstance = mapRef.current?.getMap();
      const boundsKey = boundsToKey(mapInstance ? mapInstance.getBounds() : null);

      setHoverTarget({ clusterId, parentCells, boundsKey });
    },
    [algorithm, mapRef, hoverTarget]
  );

  const handleH3HoverLeave = useCallback(() => {
    setHoverTarget((prev) => (prev === null ? prev : null));
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
      } else {
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
