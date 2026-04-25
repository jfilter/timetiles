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
import { parseH3ClusterFilter } from "@/lib/geospatial";
import { useDataSourcesQuery } from "@/lib/hooks/use-data-sources-query";
import {
  useBoundsQuery,
  useClusterChildrenQuery,
  useClusterSummaryQuery,
  useEventsListQuery,
  useEventsTotalQuery,
  useMapClustersQuery,
} from "@/lib/hooks/use-events-queries";
import { useUIStore } from "@/lib/store";
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
  const clusterDensity = useUIStore((s) => s.ui.clusterDensity);
  const focusedCluster = useUIStore((s) => s.ui.focusedCluster);
  const clusterFilterCells = useUIStore((s) => s.ui.clusterFilterCells);

  // Build cluster filter for precise H3 cell filtering
  const clusterFilter = useMemo(() => parseH3ClusterFilter(clusterFilterCells), [clusterFilterCells]);

  // Effective bounds: use map viewport (cluster filtering is done by H3 cells, not bbox)
  const effectiveBounds = debouncedSimpleBounds;

  const {
    data: clustersData,
    isFetching: clustersFetching,
    dataUpdatedAt: clustersDataUpdatedAt,
  } = useMapClustersQuery(filters, debouncedSimpleBounds, mapZoom, true, scope, clusterDensity);
  const { data: boundsData, isLoading: boundsLoading } = useBoundsQuery(filters, true, scope);

  const clusters = clustersData?.features ?? [];

  // Fetch sub-cell children when a cluster is focused
  const parentCells = useMemo(() => {
    if (!focusedCluster) return null;
    return focusedCluster.sourceCells ?? [focusedCluster.clusterId];
  }, [focusedCluster]);
  const { data: clusterChildrenData } = useClusterChildrenQuery(
    filters,
    debouncedSimpleBounds,
    mapZoom,
    parentCells,
    focusedCluster != null,
    scope,
    clusterDensity
  );
  const clusterChildren = clusterChildrenData?.features ?? null;

  // Fetch summary data for focused cluster (mini dashboard)
  const { data: clusterSummary, isLoading: clusterSummaryLoading } = useClusterSummaryQuery(
    filters,
    parentCells,
    focusedCluster?.h3Resolution ?? 6,
    focusedCluster != null,
    scope
  );

  const {
    data: eventsData,
    isFetching: eventsFetching,
    dataUpdatedAt: eventsDataUpdatedAt,
  } = useEventsListQuery(filters, effectiveBounds, 1000, true, scope, clusterFilter);
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
    clusterChildren,
    clusterSummary,
    clusterSummaryLoading,
    clustersFetching,
    clustersDataUpdatedAt,
    effectiveBounds,
    boundsData,
    boundsLoading,
    events,
    eventsData,
    eventsFetching,
    eventsDataUpdatedAt,
    totalEventsData,
    hasTemporalData,
  };
};
