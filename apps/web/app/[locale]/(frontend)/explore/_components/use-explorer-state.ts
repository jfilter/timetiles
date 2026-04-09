/**
 * Shared state and data fetching for map and list explorer components.
 *
 * Thin orchestrator that composes {@link useExplorerViewport} (map state)
 * and {@link useExplorerQueries} (data fetching), plus filter/selection/UI
 * state. Each explorer adds its own layout-specific state on top.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { useFilters, useSelectedEvent } from "@/lib/hooks/use-filters";
import { useViewScope } from "@/lib/hooks/use-view-scope";
import { useUIStore } from "@/lib/store";

import { isDataBoundsOutsideViewport, shouldShowZoomToData } from "./explorer-helpers";
import { useExplorerQueries } from "./use-explorer-queries";
import { useExplorerViewport } from "./use-explorer-viewport";

export interface UseExplorerStateOptions {
  /** Called on bounds change with center and zoom for URL persistence */
  onMapPositionChange?: (center: { lng: number; lat: number }, zoom: number) => void;
}

export const useExplorerState = (options?: UseExplorerStateOptions) => {
  // View scope for data filtering
  const scope = useViewScope();

  // URL state
  const { filters, activeFilterCount } = useFilters();
  const { selectedEventId, openEvent, closeEvent } = useSelectedEvent();

  // Viewport state (map zoom, bounds, refs, debouncing)
  const viewport = useExplorerViewport(options);
  const { mapZoom, mapRef, mapBounds, boundsState, simpleBounds, debouncedSimpleBounds } = viewport;

  // Data fetching
  const queries = useExplorerQueries(filters, debouncedSimpleBounds, mapZoom, scope);
  const { boundsData, boundsLoading, eventsData } = queries;

  // Zustand UI state
  const isFilterDrawerOpen = useUIStore((state) => state.ui.isFilterDrawerOpen);
  const toggleFilterDrawer = useUIStore((state) => state.toggleFilterDrawer);
  const setFilterDrawerOpen = useUIStore((state) => state.setFilterDrawerOpen);

  // Push visible event count to Zustand so the header (outside explore tree) can display it.
  // Use eventsData.total (from API pagination) instead of events.length, because the events
  // array is capped at 1000 items while total reflects the true count matching the viewport+filters.
  const setMapStats = useUIStore((state) => state.setMapStats);
  useEffect(() => {
    if (eventsData != null) {
      setMapStats({ visibleEvents: eventsData.total });
    }
  }, [eventsData, setMapStats]);

  // Clear stale mapStats when the explorer unmounts (e.g. route transition away from /explore).
  // Without this, the header would briefly show the previous count until new data loads.
  useEffect(() => {
    return () => {
      useUIStore.getState().setMapStats(null);
    };
  }, []);

  // Auto-exit focus mode and clear cluster filter when filters change
  const clearFocusedCluster = useUIStore((state) => state.clearFocusedCluster);
  const setClusterFilterCells = useUIStore((state) => state.setClusterFilterCells);
  const filterKey = JSON.stringify(filters);
  useEffect(() => {
    clearFocusedCluster();
    setClusterFilterCells(null);
  }, [filterKey, clearFocusedCluster, setClusterFilterCells]);

  // Auto-zoom to data when dataset selection changes
  const datasetsKey = filters.datasets.join(",");
  const prevDatasetsKeyRef = useRef(datasetsKey);
  useEffect(() => {
    if (prevDatasetsKeyRef.current !== datasetsKey) {
      prevDatasetsKeyRef.current = datasetsKey;
      // Reset bounds state so the next boundsData arrival triggers a fit
      viewport.setBoundsState("initial");
    }
  }, [datasetsKey, viewport]);

  // Fit map to data bounds on initial load or after dataset change
  useEffect(() => {
    if (boundsState === "initial" && boundsData?.bounds && mapRef.current && !boundsLoading) {
      mapRef.current.fitBounds(boundsData.bounds, { padding: 50, animate: true });
      viewport.setBoundsState("bounds-applied");
    }
  }, [boundsState, boundsData?.bounds, boundsLoading, mapRef, viewport]);

  const isLoadingInitialBounds = boundsLoading && boundsState === "initial";

  const handleZoomToData = useCallback(() => {
    if (boundsData?.bounds && mapRef.current) {
      mapRef.current.fitBounds(boundsData.bounds, { padding: 50, animate: true });
      viewport.setBoundsState("bounds-applied");
    }
  }, [boundsData?.bounds, mapRef, viewport]);

  // Shared zoom-to-data logic
  const dataBoundsOutsideViewport = isDataBoundsOutsideViewport(boundsData?.bounds, mapBounds);
  const showZoomToData = shouldShowZoomToData(
    boundsState === "user-panned",
    dataBoundsOutsideViewport,
    boundsData?.bounds != null,
    boundsLoading
  );

  return {
    map: {
      zoom: mapZoom,
      ref: mapRef,
      bounds: mapBounds,
      simpleBounds,
      debouncedSimpleBounds,
      boundsState,
      showZoomToData,
      handleBoundsChange: viewport.handleBoundsChange,
      handleZoomToData,
    },
    filters: { filters, activeFilterCount },
    selection: useMemo(() => ({ selectedEventId, openEvent, closeEvent }), [selectedEventId, openEvent, closeEvent]),
    data: { ...queries, isLoadingInitialBounds },
    ui: useMemo(
      () => ({ isFilterDrawerOpen, toggleFilterDrawer, setFilterDrawerOpen }),
      [isFilterDrawerOpen, toggleFilterDrawer, setFilterDrawerOpen]
    ),
    scope,
  };
};
