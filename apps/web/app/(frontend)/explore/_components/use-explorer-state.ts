/**
 * Shared state and data fetching for map and list explorer components.
 *
 * Encapsulates common logic: filter state, map bounds tracking, cluster queries,
 * and zoom-to-data functionality. Each explorer adds its own layout-specific
 * state on top (e.g., MapExplorer adds URL-based map position, ListExplorer
 * adds mobile tab navigation).
 *
 * @module
 * @category Hooks
 */
"use client";

import type { LngLatBounds } from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ClusteredMapHandle } from "@/components/maps/clustered-map";
import { useFilters, useSelectedEvent } from "@/lib/filters";
import { useDataSourcesQuery } from "@/lib/hooks/use-data-sources-query";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useBoundsQuery, useClusterStatsQuery, useMapClustersQuery } from "@/lib/hooks/use-events-queries";
import { useUIStore } from "@/lib/store";

import { simplifyBounds } from "./map-explorer-helpers";

interface UseExplorerStateOptions {
  /** Called on bounds change with center and zoom for URL persistence */
  onMapPositionChange?: (center: { lng: number; lat: number }, zoom: number) => void;
}

export const useExplorerState = (options?: UseExplorerStateOptions) => {
  const [mapZoom, setMapZoom] = useState(9);
  const [hasUserPanned, setHasUserPanned] = useState(false);
  const [isInitialBoundsApplied, setIsInitialBoundsApplied] = useState(false);

  const mapRef = useRef<ClusteredMapHandle>(null);
  const prevFiltersRef = useRef<unknown>(null);

  // Stable ref for onMapPositionChange to avoid re-creating handleBoundsChange
  const onMapPositionChangeRef = useRef(options?.onMapPositionChange);
  onMapPositionChangeRef.current = options?.onMapPositionChange;

  // URL state
  const { filters, activeFilterCount } = useFilters();
  const { selectedEventId, openEvent, closeEvent } = useSelectedEvent();

  // Data sources for filter labels
  const { data: dataSources } = useDataSourcesQuery();
  const catalogs = dataSources?.catalogs ?? [];
  const datasets = dataSources?.datasets ?? [];

  // Zustand store
  const mapBounds = useUIStore((state) => state.ui.mapBounds);
  const setMapBounds = useUIStore((state) => state.setMapBounds);
  const isFilterDrawerOpen = useUIStore((state) => state.ui.isFilterDrawerOpen);
  const toggleFilterDrawer = useUIStore((state) => state.toggleFilterDrawer);
  const setFilterDrawerOpen = useUIStore((state) => state.setFilterDrawerOpen);

  // Bounds
  const simpleBounds = useMemo(() => simplifyBounds(mapBounds), [mapBounds]);
  const debouncedSimpleBounds = useDebounce(simpleBounds, 300);

  // Data fetching
  const { data: clustersData, isLoading: clustersLoading } = useMapClustersQuery(
    filters,
    debouncedSimpleBounds,
    mapZoom
  );
  const { data: clusterStats } = useClusterStatsQuery(filters);
  const { data: boundsData, isLoading: boundsLoading } = useBoundsQuery(filters);

  const clusters = clustersData?.features ?? [];

  // Reset user panning state when filters change
  useEffect(() => {
    const filtersChanged = JSON.stringify(prevFiltersRef.current) !== JSON.stringify(filters);
    if (filtersChanged) {
      prevFiltersRef.current = filters;
      setHasUserPanned(false);
    }
  }, [filters]);

  const isLoadingInitialBounds = boundsLoading && !isInitialBoundsApplied;

  const handleZoomToData = useCallback(() => {
    if (boundsData?.bounds && mapRef.current) {
      mapRef.current.fitBounds(boundsData.bounds, { padding: 50, animate: true });
      setHasUserPanned(false);
    }
  }, [boundsData]);

  const handleBoundsChange = useCallback(
    (newBounds: LngLatBounds | null, zoom?: number, center?: { lng: number; lat: number }) => {
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

        if (!isInitialBoundsApplied) {
          setIsInitialBoundsApplied(true);
        } else {
          setHasUserPanned(true);
        }
      } else {
        setMapBounds(null);
      }
    },
    [setMapBounds, isInitialBoundsApplied]
  );

  return {
    // State
    mapZoom,
    hasUserPanned,
    isInitialBoundsApplied,
    mapRef,

    // URL state
    filters,
    activeFilterCount,
    selectedEventId,
    openEvent,
    closeEvent,

    // Data sources
    dataSources,
    catalogs,
    datasets,

    // UI store
    mapBounds,
    isFilterDrawerOpen,
    toggleFilterDrawer,
    setFilterDrawerOpen,

    // Bounds
    simpleBounds,
    debouncedSimpleBounds,

    // Query data
    clusters,
    clustersLoading,
    clusterStats,
    boundsData,
    boundsLoading,
    isLoadingInitialBounds,

    // Callbacks
    handleZoomToData,
    handleBoundsChange,
  };
};
