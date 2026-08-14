/**
 * Entry point for the events query hooks, grouped by feature area.
 *
 * The implementations live in the domain modules re-exported below; import from
 * one of those directly when a component only needs a single area.
 *
 * @module
 * @category Hooks
 */
"use client";

export type { ChartQueryResult } from "./events-chart-query";
export type { ClusterDensitySettings, ClusterFilter, TemporalClusterOptions } from "./events-query-keys";
export { eventsQueryKeys } from "./events-query-keys";
export { useEventDetailQuery } from "./use-events-detail-queries";
export type { EventsListResponse } from "./use-events-list-queries";
export {
  useEventsInfiniteFlattened,
  useEventsInfiniteQuery,
  useEventsListQuery,
  useEventsTotalQuery,
} from "./use-events-list-queries";
export type { H3HoverChildFeature } from "./use-events-map-queries";
export {
  useBoundsQuery,
  useClusterChildrenQuery,
  useClusterStatsQuery,
  useClusterSummaryQuery,
  useH3HoverChildrenQuery,
  useMapClustersQuery,
} from "./use-events-map-queries";
export { useEventsAggregationQuery } from "./use-events-stats-queries";
export {
  buildFullRangeFilters,
  useFullHistogramQuery,
  useHistogramQuery,
  useTemporalClustersQuery,
} from "./use-events-temporal-queries";
