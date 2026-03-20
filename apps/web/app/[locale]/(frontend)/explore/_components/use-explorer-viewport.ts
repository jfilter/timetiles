/**
 * Viewport state management for the explore page.
 *
 * Tracks map zoom, bounds, debounced bounds, and user panning state.
 * Provides callbacks for bounds changes and position persistence.
 *
 * @module
 * @category Hooks
 */
"use client";

import type { LngLatBounds } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

import type { ClusteredMapHandle } from "@/components/maps/clustered-map";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useFilters } from "@/lib/hooks/use-filters";
import { useUIStore } from "@/lib/store";
import { serializeFilterKey } from "@/lib/types/filter-state";

import { simplifyBounds } from "./explorer-helpers";

export type BoundsState = "initial" | "bounds-applied" | "user-panned";

interface UseExplorerViewportOptions {
  /** Called on bounds change with center and zoom for URL persistence */
  onMapPositionChange?: (center: { lng: number; lat: number }, zoom: number) => void;
}

export const useExplorerViewport = (options?: UseExplorerViewportOptions) => {
  const [mapZoom, setMapZoom] = useState(9);
  const [boundsState, setBoundsState] = useState<BoundsState>("initial");

  const mapRef = useRef<ClusteredMapHandle>(null);

  // Stable ref for onMapPositionChange to avoid re-creating handleBoundsChange
  const onMapPositionChangeRef = useRef(options?.onMapPositionChange);
  onMapPositionChangeRef.current = options?.onMapPositionChange;

  // Zustand store
  const mapBounds = useUIStore((state) => state.ui.mapBounds);
  const setMapBounds = useUIStore((state) => state.setMapBounds);

  // Bounds
  const simpleBounds = simplifyBounds(mapBounds);
  const debouncedSimpleBounds = useDebounce(simpleBounds, 300);

  // Reset user panning state when filters change
  const { filters } = useFilters();
  const filterKey = serializeFilterKey(filters);
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      setBoundsState((prev) => (prev === "user-panned" ? "bounds-applied" : prev));
    }
  }, [filterKey]);

  const handleBoundsChange = (newBounds: LngLatBounds | null, zoom?: number, center?: { lng: number; lat: number }) => {
    if (newBounds) {
      setMapBounds({
        north: newBounds.getNorth(),
        south: newBounds.getSouth(),
        east: newBounds.getEast(),
        west: newBounds.getWest(),
      });
      if (zoom != undefined) {
        setMapZoom(Math.round(zoom));
      }

      // Notify caller about position change for URL persistence
      if (center && zoom != undefined && onMapPositionChangeRef.current) {
        onMapPositionChangeRef.current(center, zoom);
      }

      if (boundsState === "initial") {
        setBoundsState("bounds-applied");
      } else if (boundsState === "bounds-applied") {
        setBoundsState("user-panned");
      }
    } else {
      setMapBounds(null);
    }
  };

  return {
    mapZoom,
    mapRef,
    mapBounds,
    boundsState,
    simpleBounds,
    debouncedSimpleBounds,
    handleBoundsChange,
    setBoundsState,
  };
};
