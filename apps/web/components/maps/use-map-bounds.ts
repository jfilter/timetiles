/**
 * Hook encapsulating map positioning, bounds-fitting, and viewport-change callbacks.
 *
 * Manages the isMapPositioned flag, handles initial bounds/viewState on load,
 * and exposes handleLoad / handleMoveEnd for the MapGL event props.
 *
 * @module
 * @category Hooks
 */
"use client";

import type { LngLatBounds } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { MapRef } from "react-map-gl/maplibre";

import type { SimpleBounds } from "@/lib/utils/event-params";

import type { MapViewState } from "./clustered-map";
import { fitMapToBounds, logMapInitialized, logMapViewportChanged } from "./clustered-map-helpers";

type MapEventTarget = {
  getBounds: () => LngLatBounds;
  getZoom: () => number;
  getCenter: () => { lng: number; lat: number };
};

interface UseMapBoundsProps {
  initialBounds?: SimpleBounds | null;
  initialViewState?: MapViewState | null;
  onBoundsChange?: (bounds: LngLatBounds, zoom: number, center?: { lng: number; lat: number }) => void;
  mapRef: React.RefObject<MapRef | null>;
  setCurrentZoom: (zoom: number) => void;
}

export const useMapBounds = ({
  initialBounds,
  initialViewState,
  onBoundsChange,
  mapRef,
  setCurrentZoom,
}: UseMapBoundsProps) => {
  const [isMapPositioned, setIsMapPositioned] = useState(!!initialViewState);
  const hasAppliedBoundsRef = useRef(false);

  // Fit map to bounds when they arrive after the initial map load (race condition fix:
  // onLoad fires once before the bounds query resolves, so we need this effect)
  useEffect(() => {
    if (!initialViewState && initialBounds && mapRef.current && !hasAppliedBoundsRef.current) {
      fitMapToBounds(mapRef.current, initialBounds, { animate: false });
      hasAppliedBoundsRef.current = true;
      setIsMapPositioned(true);
    }
  }, [initialBounds, initialViewState, mapRef]);

  const handleLoad = (evt: { target: MapEventTarget }) => {
    const map = evt.target as MapRef;
    if (initialViewState) {
      map.flyTo({
        center: [initialViewState.longitude, initialViewState.latitude],
        zoom: initialViewState.zoom,
        animate: false,
      });
      hasAppliedBoundsRef.current = true;
    } else if (initialBounds) {
      fitMapToBounds(map, initialBounds, { animate: false });
      hasAppliedBoundsRef.current = true;
    }
    setIsMapPositioned(true);
    const { bounds, zoom } = logMapInitialized(map, !!initialBounds || !!initialViewState);
    const center = map.getCenter();
    onBoundsChange?.(bounds, zoom, { lng: center.lng, lat: center.lat });
  };

  const handleMoveEnd = (evt: { target: MapEventTarget }) => {
    const map = evt.target as MapRef;
    const { bounds, zoom } = logMapViewportChanged(map);
    setCurrentZoom(zoom);
    const center = map.getCenter();
    onBoundsChange?.(bounds, zoom, { lng: center.lng, lat: center.lat });
  };

  return { isMapPositioned, handleLoad, handleMoveEnd };
};
