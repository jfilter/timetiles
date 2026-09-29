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
  onBoundsChange?: (
    bounds: LngLatBounds,
    zoom: number,
    center?: { lng: number; lat: number },
    isUserMove?: boolean
  ) => void;
  mapRef: React.RefObject<MapRef | null>;
  setCurrentZoom: (zoom: number) => void;
}

/** Moves the map to the URL view state or else the data bounds; returns whether it moved. */
const applyInitialPosition = (
  map: MapRef,
  initialViewState: MapViewState | null | undefined,
  initialBounds: SimpleBounds | null | undefined
): boolean => {
  if (initialViewState) {
    map.flyTo({
      center: [initialViewState.longitude, initialViewState.latitude],
      zoom: initialViewState.zoom,
      animate: false,
    });
    return true;
  }
  if (initialBounds) {
    fitMapToBounds(map, initialBounds, { animate: false });
    return true;
  }
  return false;
};

export const useMapBounds = ({
  initialBounds,
  initialViewState,
  onBoundsChange,
  mapRef,
  setCurrentZoom,
}: UseMapBoundsProps) => {
  const [isMapPositioned, setIsMapPositioned] = useState(!!initialViewState);
  // Distinct from isMapPositioned, which starts true for a URL-supplied view
  // state — i.e. before the maplibre instance exists. Consumers that need to
  // touch the live map (attach native listeners, query layers) must wait for
  // this instead.
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const hasAppliedBoundsRef = useRef(false);

  // Fit map to bounds or apply view state when they arrive after initial load.
  // Race conditions:
  //   1. onLoad fires once before the bounds query resolves.
  //   2. URL-derived initialViewState may hydrate after onLoad (nuqs reads
  //      searchParams on the client, which is async during initial render).
  // Without this effect, the map stays at the hardcoded INITIAL_VIEW_STATE.
  useEffect(() => {
    if (!mapRef.current || hasAppliedBoundsRef.current) return;
    if (applyInitialPosition(mapRef.current, initialViewState, initialBounds)) {
      hasAppliedBoundsRef.current = true;
      setIsMapPositioned(true);
    }
  }, [initialBounds, initialViewState, mapRef]);

  const handleLoad = (evt: { target: MapEventTarget }) => {
    const map = evt.target as MapRef;
    // The style often loads after the effect above has positioned the map and the user has begun
    // moving it; positioning again here would cancel that move.
    if (!hasAppliedBoundsRef.current && applyInitialPosition(map, initialViewState, initialBounds)) {
      hasAppliedBoundsRef.current = true;
    }
    setIsMapPositioned(true);
    setIsMapLoaded(true);
    const { bounds, zoom } = logMapInitialized(map, !!initialBounds || !!initialViewState);
    const center = map.getCenter();
    onBoundsChange?.(bounds, zoom, { lng: center.lng, lat: center.lat }, false);
  };

  const handleMoveEnd = (evt: { target: MapEventTarget; originalEvent?: unknown }) => {
    const map = evt.target as MapRef;
    const { bounds, zoom } = logMapViewportChanged(map);
    setCurrentZoom(zoom);
    const center = map.getCenter();
    // MapLibre only sets originalEvent for moves driven by real input
    // (drag/wheel/keyboard) — programmatic fitBounds/flyTo moves have none.
    // Callers use this to tell user pans from auto-fits.
    onBoundsChange?.(bounds, zoom, { lng: center.lng, lat: center.lat }, evt.originalEvent != null);
  };

  return { isMapPositioned, isMapLoaded, handleLoad, handleMoveEnd };
};
