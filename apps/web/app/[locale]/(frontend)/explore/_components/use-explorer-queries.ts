/**
 * Data fetching hooks for the explore page.
 *
 * Bundles the cluster, bounds, events, and data source queries used by
 * both the map and list explorer components.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useMemo } from "react";

import { EMPTY_ARRAY } from "@/lib/constants/empty";
import { useDataSourcesQuery } from "@/lib/hooks/use-data-sources-query";
import {
  useBoundsQuery,
  useClusterStatsQuery,
  useEventsListQuery,
  useEventsTotalQuery,
  useMapClustersQuery,
} from "@/lib/hooks/use-events-queries";
import type { FilterState } from "@/lib/types/filter-state";
import type { SimpleBounds, ViewScope } from "@/lib/utils/event-params";
import { hasVisibleTemporalData } from "@/lib/utils/temporal-data";

export const useExplorerQueries = (
  filters: FilterState,
  debouncedSimpleBounds: SimpleBounds | null,
  mapZoom: number,
  scope?: ViewScope
) => {
  const { data: dataSources } = useDataSourcesQuery();

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

  const { data: eventsData, isLoading: eventsLoading } = useEventsListQuery(
    filters,
    debouncedSimpleBounds,
    1000,
    true,
    scope
  );
  const { data: totalEventsData } = useEventsTotalQuery(filters, true, scope);
  const events = eventsData?.events ?? EMPTY_ARRAY;

  const hasTemporalData = useMemo(
    () => hasVisibleTemporalData(dataSources?.datasets, filters),
    [dataSources?.datasets, filters]
  );

  return {
    dataSources,
    catalogs: dataSources?.catalogs ?? [],
    datasets: dataSources?.datasets ?? [],
    clusters,
    clustersLoading,
    clusterStats,
    boundsData,
    boundsLoading,
    events,
    eventsData,
    eventsLoading,
    totalEventsData,
    hasTemporalData,
  };
};
