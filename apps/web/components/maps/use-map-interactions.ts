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
}

export const useMapInteractions = ({ formatFallbackTitle, onEventClick }: UseMapInteractionsProps) => {
  const [popupInfo, setPopupInfo] = useState<PopupInfo | null>(null);

  const closePopup = useCallback(() => setPopupInfo(null), []);

  const handleClusterClick = useCallback((event: MapLayerMouseEvent, feature: GeoJSON.Feature) => {
    const coordinates = getValidCoordinates(feature);
    if (coordinates) {
      event.target.flyTo({ center: coordinates, zoom: event.target.getZoom() + 2 });
    }
  }, []);

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
      if (!feature) return;
      const { type } = feature.properties ?? {};
      if (type === "event-cluster") handleClusterClick(event, feature);
      else if (type === "event-point") handleEventPointClick(feature);
    },
    [handleClusterClick, handleEventPointClick]
  );

  return { popupInfo, closePopup, handleClick };
};
