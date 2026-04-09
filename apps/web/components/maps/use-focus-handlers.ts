/**
 * Hook encapsulating focus-mode keyboard and mouse handlers for ClusteredMap.
 *
 * Manages the Escape key listener to clear focused clusters and provides
 * double-click zoom and panel zoom callbacks.
 *
 * @module
 * @category Hooks
 */
"use client";

import type { MapLayerMouseEvent } from "maplibre-gl";
import { useCallback, useEffect } from "react";
import type { MapRef } from "react-map-gl/maplibre";

interface FocusedCluster {
  clusterId: string;
}

interface UseFocusHandlersProps {
  focusedCluster: FocusedCluster | null;
  mapRef: React.RefObject<MapRef | null>;
  handleFocusedClusterZoom: (map: MapRef) => void;
  clearFocusedCluster: () => void;
}

export const useFocusHandlers = ({
  focusedCluster,
  mapRef,
  handleFocusedClusterZoom,
  clearFocusedCluster,
}: UseFocusHandlersProps) => {
  // Escape key exits focus mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && focusedCluster) clearFocusedCluster();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedCluster, clearFocusedCluster]);

  // Double-click on focused cluster → zoom in
  const handleDblClick = useCallback(
    (event: MapLayerMouseEvent) => {
      if (!focusedCluster || !mapRef.current) return;
      const feature = event.features?.[0];
      if (feature && String(feature.id ?? "") === focusedCluster.clusterId) {
        event.preventDefault();
        handleFocusedClusterZoom(mapRef.current);
      }
    },
    [focusedCluster, mapRef, handleFocusedClusterZoom]
  );

  const handleZoomInFromPanel = useCallback(() => {
    if (mapRef.current) handleFocusedClusterZoom(mapRef.current);
  }, [mapRef, handleFocusedClusterZoom]);

  return { handleDblClick, handleZoomInFromPanel };
};
