/**
 * Hook encapsulating map click handlers, popup state, and event handling.
 *
 * Extracts interaction logic from ClusteredMap to keep the component
 * focused on rendering.
 *
 * @module
 * @category Hooks
 */
"use client";

import type { MapLayerMouseEvent } from "maplibre-gl";
import { useCallback, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";

import { useUIStore } from "@/lib/store";

import { getValidCoordinates } from "./clustered-map-helpers";

export interface PopupInfo {
  longitude: number;
  latitude: number;
  title: string;
}

interface UseMapInteractionsProps {
  /** Formats a fallback title when an event has no title property */
  formatFallbackTitle: (featureId: string) => string;
  /** Called when an individual event point is clicked */
  onEventClick?: (eventId: number) => void;
  /** Current zoom level (used to derive H3 resolution for focus mode) */
  zoom: number;
  /** H3 resolution scale (default 0.6) */
  h3ResolutionScale?: number;
}

export const useMapInteractions = ({
  formatFallbackTitle,
  onEventClick,
  zoom,
  h3ResolutionScale = 0.6,
}: UseMapInteractionsProps) => {
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);
  const focusedCluster = useUIStore((s) => s.ui.focusedCluster);
  const setFocusedCluster = useUIStore((s) => s.setFocusedCluster);
  const clearFocusedCluster = useUIStore((s) => s.clearFocusedCluster);

  const closePopup = useCallback(() => setPopupInfo(null), []);

  const handleClusterClick = useCallback(
    (feature: GeoJSON.Feature) => {
      const coordinates = getValidCoordinates(feature);
      if (!coordinates) return;

      const clusterId = String(feature.properties?.clusterId ?? feature.id ?? "");
      const count = Number(feature.properties?.count ?? 1);

      // Parse sourceCells from feature properties (MapLibre serializes as JSON string)
      const rawSourceCells = feature.properties?.sourceCells;
      let sourceCells: string[] | null = null;
      if (typeof rawSourceCells === "string") {
        sourceCells = JSON.parse(rawSourceCells) as string[];
      } else if (Array.isArray(rawSourceCells)) {
        sourceCells = rawSourceCells as string[];
      }

      const h3Resolution = Math.min(13, Math.max(2, Math.round(zoom * h3ResolutionScale)));

      // Toggle: clicking same cluster clears focus, different cluster switches focus
      if (focusedCluster?.clusterId === clusterId) {
        clearFocusedCluster();
      } else {
        setFocusedCluster({ clusterId, center: coordinates, count, sourceCells, h3Resolution });
      }
    },
    [zoom, h3ResolutionScale, focusedCluster?.clusterId, setFocusedCluster, clearFocusedCluster]
  );

  const handleFocusedClusterZoom = useCallback(
    (mapRef: MapRef) => {
      const cluster = useUIStore.getState().ui.focusedCluster;
      if (!cluster) return;
      const targetZoom = Math.min(20, (cluster.h3Resolution + 1) / h3ResolutionScale);
      clearFocusedCluster();
      mapRef.flyTo({ center: cluster.center, zoom: targetZoom });
    },
    [h3ResolutionScale, clearFocusedCluster]
  );

  const handleEventPointClick = useCallback(
    (feature: GeoJSON.Feature) => {
      const { eventId: rawEventId } = feature.properties ?? {};
      const eventId = typeof rawEventId === "number" ? rawEventId : Number(rawEventId);

      if (onEventClick && Number.isFinite(eventId)) {
        onEventClick(eventId);
        return;
      }

      const coordinates = getValidCoordinates(feature);
      if (coordinates) {
        const { title } = feature.properties ?? {};
        setPopupInfo({
          longitude: coordinates[0],
          latitude: coordinates[1],
          title: typeof title === "string" ? title : formatFallbackTitle(String(feature.id ?? "Unknown")),
        });
      }
    },
    [formatFallbackTitle, onEventClick]
  );

  const handleClick = useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) {
        // Click on background — clear focus
        clearFocusedCluster();
        return;
      }
      const { type } = feature.properties ?? {};
      if (type === "event-cluster") handleClusterClick(feature);
      else if (type === "event-point") handleEventPointClick(feature);
    },
    [handleClusterClick, handleEventPointClick, clearFocusedCluster]
  );

  return { popupInfo, closePopup, handleClick, handleFocusedClusterZoom, clearFocusedCluster };
};
