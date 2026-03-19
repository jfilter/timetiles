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
import { useEffect, useRef, useState } from "react";

import type { ClusteredMapHandle } from "@/components/maps/clustered-map";
import { EMPTY_ARRAY } from "@/lib/constants/empty";
import { useDataSourcesQuery } from "@/lib/hooks/use-data-sources-query";
import { useDebounce } from "@/lib/hooks/use-debounce";
import {
  useBoundsQuery,
  useClusterStatsQuery,
  useEventsListQuery,
  useEventsTotalQuery,
  useMapClustersQuery,
} from "@/lib/hooks/use-events-queries";
import { useFilters, useSelectedEvent } from "@/lib/hooks/use-filters";
import { useViewScope } from "@/lib/hooks/use-view-scope";
import { useUIStore } from "@/lib/store";
import { serializeFilterKey } from "@/lib/types/filter-state";

import { isDataBoundsOutsideViewport, shouldShowZoomToData, simplifyBounds } from "./map-explorer-helpers";

interface UseExplorerStateOptions {
  /** Called on bounds change with center and zoom for URL persistence */
  onMapPositionChange?: (center: { lng: number; lat: number }, zoom: number) => void;
}

// eslint-disable-next-line sonarjs/max-lines-per-function -- explorer hook centralises shared state for both layouts
export const useExplorerState = (options?: UseExplorerStateOptions) => {
  const [mapZoom, setMapZoom] = useState(9);
  const [boundsState, setBoundsState] = useState<"initial" | "bounds-applied" | "user-panned">("initial");

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
  const simpleBounds = simplifyBounds(mapBounds);
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

  // Events list + total (shared by both MapExplorer and ListExplorer)
  const { data: eventsData, isLoading: eventsLoading } = useEventsListQuery(
    filters,
    debouncedSimpleBounds,
    1000,
    true,
    scope
  );
  const { data: totalEventsData } = useEventsTotalQuery(filters, true, scope);
  const events = eventsData?.events ?? EMPTY_ARRAY;

  // Update header stats in Zustand store when data changes
  const setMapStats = useUIStore((state) => state.setMapStats);
  useEffect(() => {
    if (eventsData != null && totalEventsData != null) {
      setMapStats({ visibleEvents: events.length, totalEvents: totalEventsData.total });
    }
  }, [events.length, eventsData, totalEventsData, setMapStats]);

  // Reset user panning state when filters change
  const filterKey = serializeFilterKey(filters);
  const prevFilterKeyRef = useRef(filterKey);
  useEffect(() => {
    if (prevFilterKeyRef.current !== filterKey) {
      prevFilterKeyRef.current = filterKey;
      setBoundsState((prev) => (prev === "user-panned" ? "bounds-applied" : prev));
    }
  }, [filterKey]);

  const isLoadingInitialBounds = boundsLoading && boundsState === "initial";

  const handleZoomToData = () => {
    if (boundsData?.bounds && mapRef.current) {
      mapRef.current.fitBounds(boundsData.bounds, { padding: 50, animate: true });
      setBoundsState("bounds-applied");
    }
  };

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

  // Shared zoom-to-data logic (both MapExplorer and ListExplorer)
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
      events,
      eventsData,
      eventsLoading,
      totalEventsData,
    },
    ui: { isFilterDrawerOpen, toggleFilterDrawer, setFilterDrawerOpen },
    scope,
  };
};
