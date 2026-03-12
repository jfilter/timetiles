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
import { useViewScope } from "@/lib/hooks/use-view-scope";
import { useUIStore } from "@/lib/store";

import { simplifyBounds } from "./map-explorer-helpers";

interface UseExplorerStateOptions {
  /** Called on bounds change with center and zoom for URL persistence */
  onMapPositionChange?: (center: { lng: number; lat: number }, zoom: number) => void;
}

// eslint-disable-next-line sonarjs/max-lines-per-function -- Hook consolidates shared explorer state/queries/callbacks
export const useExplorerState = (options?: UseExplorerStateOptions) => {
  const [mapZoom, setMapZoom] = useState(9);
  const [hasUserPanned, setHasUserPanned] = useState(false);
  const [isInitialBoundsApplied, setIsInitialBoundsApplied] = useState(false);

  const mapRef = useRef<ClusteredMapHandle>(null);

  // Stable ref for onMapPositionChange to avoid re-creating handleBoundsChange
  const onMapPositionChangeRef = useRef(options?.onMapPositionChange);
  onMapPositionChangeRef.current = options?.onMapPositionChange;

  // View scope for data filtering
  const scope = useViewScope();

  // URL state
  const { filters, activeFilterCount } = useFilters();
  const { selectedEventId, openEvent, closeEvent } = useSelectedEvent();

  // Data sources for filter labels
  const { data: dataSources } = useDataSourcesQuery();

  // Zustand store
  const mapBounds = useUIStore((state) => state.ui.mapBounds);
  const setMapBounds = useUIStore((state) => state.setMapBounds);
  const isFilterDrawerOpen = useUIStore((state) => state.ui.isFilterDrawerOpen);
  const toggleFilterDrawer = useUIStore((state) => state.toggleFilterDrawer);
  const setFilterDrawerOpen = useUIStore((state) => state.setFilterDrawerOpen);

  // Bounds
  const simpleBounds = useMemo(() => simplifyBounds(mapBounds), [mapBounds]);
  const debouncedSimpleBounds = useDebounce(simpleBounds, 300);

  // Data fetching (with view scope)
  const { data: clustersData, isLoading: clustersLoading } = useMapClustersQuery(
    filters,
    debouncedSimpleBounds,
    mapZoom,
    true,
    scope
  );
  const { data: clusterStats } = useClusterStatsQuery(filters, true, scope);
  const { data: boundsData, isLoading: boundsLoading } = useBoundsQuery(filters, true, scope);

  const clusters = clustersData?.features ?? [];

  // Reset user panning state when filters change (using a stable key to avoid serializing the full object twice)
  const filterKey = `${filters.catalog}|${filters.datasets.join(",")}|${filters.startDate}|${filters.endDate}|${Object.entries(
    filters.fieldFilters
  )
    .map(([k, v]) => `${k}:${v.join(",")}`)
    .join(";")}`;
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      setHasUserPanned(false);
    }
  }, [filterKey]);

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

        if (isInitialBoundsApplied) {
          setHasUserPanned(true);
        } else {
          setIsInitialBoundsApplied(true);
        }
      } else {
        setMapBounds(null);
      }
    },
    [setMapBounds, isInitialBoundsApplied]
  );

  return {
    map: {
      zoom: mapZoom,
      ref: mapRef,
      bounds: mapBounds,
      simpleBounds,
      debouncedSimpleBounds,
      hasUserPanned,
      isInitialBoundsApplied,
      handleBoundsChange,
      handleZoomToData,
    },
    filters: { filters, activeFilterCount },
    selection: { selectedEventId, openEvent, closeEvent },
    data: {
      dataSources,
      catalogs: dataSources?.catalogs ?? [],
      datasets: dataSources?.datasets ?? [],
      clusters,
      clustersLoading,
      clusterStats,
      boundsData,
      boundsLoading,
      isLoadingInitialBounds,
    },
    ui: { isFilterDrawerOpen, toggleFilterDrawer, setFilterDrawerOpen },
    scope,
  };
};
