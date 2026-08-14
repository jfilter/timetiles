/**
 * Query key factory for every events query, plus the option shapes the keys embed.
 *
 * The keys live apart from the hooks because each cache entry is identified by the
 * full option object: a changed field here is a cache break, not a refactor.
 *
 * @module
 * @category Hooks
 */

import type { FilterState } from "../types/filter-state";
import type { BoundsType, ViewScope } from "../utils/event-params";

/** Optional H3 cell filter for precise spatial filtering. */
export interface ClusterFilter {
  cells: string[];
  h3Resolution: number;
}

/** Cluster density settings for the map clustering API. */
export interface ClusterDensitySettings {
  targetClusters?: number;
  clusterAlgorithm?: "h3" | "grid-k" | "dbscan";
  minPoints?: number;
  mergeOverlapping?: boolean;
  /** Zoom-to-H3-resolution multiplier (default 0.7). Higher = finer hexes at same zoom. */
  h3ResolutionScale?: number;
  /** Place circles at hex center instead of event centroid. */
  useHexCenter?: boolean;
}

/** Options for temporal cluster granularity. */
export interface TemporalClusterOptions {
  /** Max events before switching to clustered mode (default: 500) */
  individualThreshold?: number;
  /** Target number of time buckets in clustered mode (default: 40) */
  targetBuckets?: number;
  /** Group by field: "dataset" (default), "catalog", or any JSONB field path */
  groupBy?: string;
}

export const eventsQueryKeys = {
  all: ["events"] as const,
  detail: (eventId: number) => [...eventsQueryKeys.all, "detail", eventId] as const,
  lists: () => [...eventsQueryKeys.all, "list"] as const,
  list: (filters: FilterState, bounds: BoundsType, limit: number, scope?: ViewScope, clusterFilter?: ClusterFilter) =>
    [...eventsQueryKeys.lists(), { filters, bounds, limit, scope, clusterFilter }] as const,
  infinite: () => [...eventsQueryKeys.all, "infinite"] as const,
  infiniteList: (
    filters: FilterState,
    bounds: BoundsType,
    limit: number,
    scope?: ViewScope,
    clusterFilter?: ClusterFilter
  ) => [...eventsQueryKeys.infinite(), { filters, bounds, limit, scope, clusterFilter }] as const,
  clusters: () => [...eventsQueryKeys.all, "clusters"] as const,
  cluster: (
    filters: FilterState,
    bounds: BoundsType,
    zoom: number,
    scope?: ViewScope,
    density?: ClusterDensitySettings
  ) => [...eventsQueryKeys.clusters(), { filters, bounds, zoom, scope, density }] as const,
  clusterStats: () => [...eventsQueryKeys.all, "cluster-stats"] as const,
  clusterStat: (filters: FilterState, scope?: ViewScope) =>
    [...eventsQueryKeys.clusterStats(), { filters, scope }] as const,
  histograms: () => [...eventsQueryKeys.all, "histogram"] as const,
  histogram: (filters: FilterState, bounds: BoundsType, scope?: ViewScope, clusterFilter?: ClusterFilter) =>
    [...eventsQueryKeys.histograms(), { filters, bounds, scope, clusterFilter }] as const,
  aggregations: () => [...eventsQueryKeys.all, "aggregation"] as const,
  aggregation: (filters: FilterState, bounds: BoundsType, groupBy: "catalog" | "dataset", scope?: ViewScope) =>
    [...eventsQueryKeys.aggregations(), { filters, bounds, groupBy, scope }] as const,
  histogramsFull: () => [...eventsQueryKeys.all, "histogram-full"] as const,
  histogramFull: (filters: FilterState, scope?: ViewScope) =>
    [...eventsQueryKeys.histogramsFull(), { filters, scope }] as const,
  bounds: () => [...eventsQueryKeys.all, "bounds"] as const,
  boundsFiltered: (filters: FilterState, scope?: ViewScope) =>
    [...eventsQueryKeys.bounds(), { filters, scope }] as const,
  temporalClusters: () => [...eventsQueryKeys.all, "temporal-clusters"] as const,
  temporalCluster: (
    filters: FilterState,
    bounds: BoundsType,
    scope?: ViewScope,
    options?: TemporalClusterOptions,
    clusterFilter?: ClusterFilter
  ) => [...eventsQueryKeys.temporalClusters(), { filters, bounds, scope, options, clusterFilter }] as const,
  clusterChildren: () => [...eventsQueryKeys.all, "cluster-children"] as const,
  clusterChild: (
    filters: FilterState,
    bounds: BoundsType,
    zoom: number,
    parentCells: string[],
    scope?: ViewScope,
    density?: ClusterDensitySettings
  ) => [...eventsQueryKeys.clusterChildren(), { filters, bounds, zoom, parentCells, scope, density }] as const,
  h3HoverChildren: () => [...eventsQueryKeys.all, "h3-hover-children"] as const,
  h3HoverChild: (clusterId: string, parentCells: string[], zoom: number, boundsKey: string) =>
    [...eventsQueryKeys.h3HoverChildren(), { clusterId, parentCells, zoom, boundsKey }] as const,
  clusterSummaries: () => [...eventsQueryKeys.all, "cluster-summary"] as const,
  clusterSummary: (filters: FilterState, cells: string[], h3Resolution: number, scope?: ViewScope) =>
    [...eventsQueryKeys.clusterSummaries(), { filters, cells, h3Resolution, scope }] as const,
};
