/**
 * Time-axis events queries: the bounded histogram, the unbounded full-range histogram
 * behind the time slider, and the adaptive clusters the beeswarm renders.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { HistogramResponse, TemporalClustersResponse } from "@/lib/schemas/events";

import { fetchJson } from "../api/http-error";
import { createLogger } from "../logger";
import type { FilterState } from "../types/filter-state";
import type { BoundsType, ViewScope } from "../utils/event-params";
import { buildEventParams } from "../utils/event-params";
import type { ChartQueryResult } from "./events-chart-query";
import { withChartFlags } from "./events-chart-query";
import type { ClusterFilter, TemporalClusterOptions } from "./events-query-keys";
import { eventsQueryKeys } from "./events-query-keys";
import { QUERY_PRESETS } from "./query-presets";

const logger = createLogger("EventsQueries");

const fetchHistogram = async (
  filters: FilterState,
  bounds: BoundsType,
  signal?: AbortSignal,
  scope?: ViewScope,
  clusterFilter?: ClusterFilter
): Promise<HistogramResponse> => {
  const extra: Record<string, string> = {};
  if (clusterFilter) {
    extra.clusterCells = clusterFilter.cells.join(",");
    extra.h3Resolution = clusterFilter.h3Resolution.toString();
  }
  const params = buildEventParams(filters, bounds, extra, scope);

  logger.debug("Fetching histogram", { filters, bounds });

  return fetchJson<HistogramResponse>(`/api/v1/events/temporal?${params.toString()}`, { signal });
};

const fetchTemporalClusters = async (
  filters: FilterState,
  bounds: BoundsType,
  signal?: AbortSignal,
  scope?: ViewScope,
  options?: TemporalClusterOptions,
  clusterFilter?: ClusterFilter
): Promise<TemporalClustersResponse> => {
  const extra: Record<string, string> = {};
  if (options?.individualThreshold != null) extra.individualThreshold = options.individualThreshold.toString();
  if (options?.targetBuckets != null) extra.targetBuckets = options.targetBuckets.toString();
  if (options?.groupBy) extra.groupBy = options.groupBy;
  if (clusterFilter) {
    extra.clusterCells = clusterFilter.cells.join(",");
    extra.h3Resolution = clusterFilter.h3Resolution.toString();
  }
  const params = buildEventParams(filters, bounds, extra, scope);

  logger.debug("Fetching temporal clusters", { filters, bounds, options });

  return fetchJson<TemporalClustersResponse>(`/api/v1/events/temporal-clusters?${params.toString()}`, { signal });
};

export const useHistogramQuery = (
  filters: FilterState,
  bounds: BoundsType,
  enabled: boolean = true,
  scope?: ViewScope,
  clusterFilter?: ClusterFilter
): ChartQueryResult<HistogramResponse> =>
  withChartFlags(
    useQuery({
      queryKey: eventsQueryKeys.histogram(filters, bounds, scope, clusterFilter),
      queryFn: ({ signal }) => fetchHistogram(filters, bounds, signal, scope, clusterFilter),
      enabled: enabled && bounds != null,
      ...QUERY_PRESETS.expensive,
      placeholderData: (previousData) => previousData,
    })
  );

/**
 * Hook to fetch adaptive temporal clusters for the beeswarm chart.
 *
 * Returns individual events for small result sets or per-dataset-per-bucket
 * clusters for large ones. Replaces the dual events+histogram fetch pattern.
 */
export const useTemporalClustersQuery = (
  filters: FilterState,
  bounds: BoundsType,
  enabled: boolean = true,
  scope?: ViewScope,
  options?: TemporalClusterOptions,
  clusterFilter?: ClusterFilter
): ChartQueryResult<TemporalClustersResponse> =>
  withChartFlags(
    useQuery({
      queryKey: eventsQueryKeys.temporalCluster(filters, bounds, scope, options, clusterFilter),
      queryFn: ({ signal }) => fetchTemporalClusters(filters, bounds, signal, scope, options, clusterFilter),
      enabled: enabled && bounds != null,
      ...QUERY_PRESETS.expensive,

      placeholderData: (previousData) => previousData,
    })
  );

/**
 * Strip date range but preserve field filters for the time range slider histogram.
 *
 * Exported only so the unit test (`use-full-histogram-filters.test.ts`) can
 * exercise the pure logic directly without spinning up React Query
 * infrastructure to drive the calling hook. The single in-tree caller is
 * `useFullHistogramQuery` below.
 */
export const buildFullRangeFilters = (filters: FilterState): FilterState => ({
  ...filters,
  startDate: null,
  endDate: null,
});

/**
 * Hook to fetch histogram data for the full date range (no date or bounds filters).
 *
 * Used by the time range slider to show the complete temporal distribution
 * regardless of the currently selected date range.
 */
export const useFullHistogramQuery = (filters: FilterState, scope?: ViewScope, enabled: boolean = true) => {
  const fullRangeFilters = buildFullRangeFilters(filters);

  return useQuery({
    queryKey: eventsQueryKeys.histogramFull(fullRangeFilters, scope),
    queryFn: ({ signal }) => fetchHistogram(fullRangeFilters, null, signal, scope),
    // Caller passes `enabled: false` when the bounded query supersedes this one
    // (bounds present), so the expensive /temporal aggregation does not fire only
    // to have its result discarded.
    enabled,
    ...QUERY_PRESETS.stable,
  });
};
