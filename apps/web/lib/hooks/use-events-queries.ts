/**
 * This file centralizes all TanStack Query (React Query) hooks for fetching events-related data.
 *
 * It defines the data fetching functions, query keys, and custom hooks for various API endpoints,
 * including:
 * - Fetching lists of events.
 * - Retrieving map clusters for efficient visualization of large datasets.
 * - Getting data for temporal histograms.
 *
 * By co-locating these hooks, it provides a consistent and organized way to manage server state
 * related to events throughout the application.
 *
 * @module
 */
"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { ClusterFeature } from "@/components/maps/clustered-map";
import type {
  AggregateResponse,
  ClusterStatsResponse,
  ClusterSummaryResponse,
  EventListItem,
  HistogramResponse,
  TemporalClustersResponse,
} from "@/lib/schemas/events";
import type { Event } from "@/payload-types";

import { fetchJson, HttpError } from "../api/http-error";
import { createLogger } from "../logger";
import type { BoundsResponse } from "../types/event-bounds";
import type { FilterState } from "../types/filter-state";
import type { BoundsType, ViewScope } from "../utils/event-params";
import { buildBaseEventParams, buildEventParams } from "../utils/event-params";
import { QUERY_PRESETS } from "./query-presets";
import type { LoadingPhase } from "./use-loading-phase";
import { useLoadingPhase } from "./use-loading-phase";

const logger = createLogger("EventsQueries");

/** Query result enriched with loading-phase flags for chart components. */
export type ChartQueryResult<TData, TError = Error> = UseQueryResult<TData, TError> & LoadingPhase;

// Types for API responses

/**
 * Client-side events list response (flattened from API pagination shape).
 */
export interface EventsListResponse {
  events: EventListItem[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

/**
 * Client-side map clusters response (subset of API GeoJSON FeatureCollection).
 */
export interface MapClustersResponse {
  features: ClusterFeature[];
}

// Typed API response matching the actual /api/v1/events shape
interface EventsApiPagination {
  totalDocs: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface EventsApiResponse {
  events: EventListItem[];
  pagination: EventsApiPagination;
}

/** Optional H3 cell filter for precise spatial filtering. */
export interface ClusterFilter {
  cells: string[];
  h3Resolution: number;
}

// Shared fetch function for events list (used by both list and infinite queries)
const fetchEventsInternal = async (
  filters: FilterState,
  bounds: BoundsType,
  options: { page?: number; limit?: number },
  signal?: AbortSignal,
  scope?: ViewScope,
  clusterFilter?: ClusterFilter
): Promise<EventsListResponse> => {
  const extra: Record<string, string> = {};
  if (options.limit != null) extra.limit = options.limit.toString();
  if (options.page != null) extra.page = options.page.toString();
  if (clusterFilter) {
    extra.clusterCells = clusterFilter.cells.join(",");
    extra.h3Resolution = clusterFilter.h3Resolution.toString();
  }
  const params = buildEventParams(filters, bounds, extra, scope);

  logger.debug("Fetching events", { filters, bounds, ...options });

  const data = await fetchJson<EventsApiResponse>(`/api/v1/events?${params.toString()}`, { signal });

  return {
    events: data.events,
    total: data.pagination.totalDocs,
    page: data.pagination.page,
    limit: data.pagination.limit,
    hasNextPage: data.pagination.hasNextPage,
    hasPrevPage: data.pagination.hasPrevPage,
  };
};

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

const fetchMapClusters = async (
  filters: FilterState,
  bounds: BoundsType,
  zoom: number,
  signal?: AbortSignal,
  scope?: ViewScope,
  density?: ClusterDensitySettings
): Promise<MapClustersResponse> => {
  const extra: Record<string, string> = { zoom: zoom.toString() };
  if (density?.targetClusters != null) extra.targetClusters = density.targetClusters.toString();
  if (density?.clusterAlgorithm != null) extra.clusterAlgorithm = density.clusterAlgorithm;
  if (density?.minPoints != null) extra.minPoints = density.minPoints.toString();
  if (density?.mergeOverlapping != null) extra.mergeOverlapping = density.mergeOverlapping.toString();
  if (density?.h3ResolutionScale != null) extra.h3ResolutionScale = density.h3ResolutionScale.toString();
  if (density?.useHexCenter) extra.useHexCenter = "true";
  const params = buildEventParams(filters, bounds, extra, scope);

  logger.debug("Fetching map clusters", { filters, bounds, zoom });

  return fetchJson<MapClustersResponse>(`/api/v1/events/geo?${params.toString()}`, { signal });
};

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

/** Options for temporal cluster granularity. */
export interface TemporalClusterOptions {
  /** Max events before switching to clustered mode (default: 500) */
  individualThreshold?: number;
  /** Target number of time buckets in clustered mode (default: 40) */
  targetBuckets?: number;
  /** Group by field: "dataset" (default), "catalog", or any JSONB field path */
  groupBy?: string;
}

const fetchTemporalClusters = async (
  filters: FilterState,
  bounds: BoundsType,
  signal?: AbortSignal,
  scope?: ViewScope,
  options?: TemporalClusterOptions
): Promise<TemporalClustersResponse> => {
  const extra: Record<string, string> = {};
  if (options?.individualThreshold != null) extra.individualThreshold = options.individualThreshold.toString();
  if (options?.targetBuckets != null) extra.targetBuckets = options.targetBuckets.toString();
  if (options?.groupBy) extra.groupBy = options.groupBy;
  const params = buildEventParams(filters, bounds, extra, scope);

  logger.debug("Fetching temporal clusters", { filters, bounds, options });

  return fetchJson<TemporalClustersResponse>(`/api/v1/events/temporal-clusters?${params.toString()}`, { signal });
};

const fetchClusterStats = async (
  filters: FilterState,
  signal?: AbortSignal,
  scope?: ViewScope
): Promise<ClusterStatsResponse> => {
  const params = buildBaseEventParams(filters, {}, scope);

  logger.debug("Fetching global cluster stats", { filters });

  return fetchJson<ClusterStatsResponse>(`/api/v1/events/geo/stats?${params.toString()}`, { signal });
};

const fetchBounds = async (filters: FilterState, signal?: AbortSignal, scope?: ViewScope): Promise<BoundsResponse> => {
  const params = buildBaseEventParams(filters, {}, scope);

  logger.debug("Fetching event bounds", { filters });

  return fetchJson<BoundsResponse>(`/api/v1/events/bounds?${params.toString()}`, { signal });
};

// Query key factories
export const eventsQueryKeys = {
  all: ["events"] as const,
  detail: (eventId: number) => [...eventsQueryKeys.all, "detail", eventId] as const,
  lists: () => [...eventsQueryKeys.all, "list"] as const,
  list: (filters: FilterState, bounds: BoundsType, limit: number, scope?: ViewScope, clusterFilter?: ClusterFilter) =>
    [...eventsQueryKeys.lists(), { filters, bounds, limit, scope, clusterFilter }] as const,
  infinite: () => [...eventsQueryKeys.all, "infinite"] as const,
  infiniteList: (filters: FilterState, bounds: BoundsType, limit: number, scope?: ViewScope) =>
    [...eventsQueryKeys.infinite(), { filters, bounds, limit, scope }] as const,
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
    [...eventsQueryKeys.histogramsFull(), { datasets: filters.datasets, scope }] as const,
  bounds: () => [...eventsQueryKeys.all, "bounds"] as const,
  boundsFiltered: (filters: FilterState, scope?: ViewScope) =>
    [...eventsQueryKeys.bounds(), { filters, scope }] as const,
  temporalClusters: () => [...eventsQueryKeys.all, "temporal-clusters"] as const,
  temporalCluster: (filters: FilterState, bounds: BoundsType, scope?: ViewScope, options?: TemporalClusterOptions) =>
    [...eventsQueryKeys.temporalClusters(), { filters, bounds, scope, options }] as const,
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

// Query hooks
export const useEventsListQuery = (
  filters: FilterState,
  bounds: BoundsType,
  limit: number = 1000,
  enabled: boolean = true,
  scope?: ViewScope,
  clusterFilter?: ClusterFilter
) =>
  useQuery({
    queryKey: eventsQueryKeys.list(filters, bounds, limit, scope, clusterFilter),
    queryFn: ({ signal }) => fetchEventsInternal(filters, bounds, { limit }, signal, scope, clusterFilter),
    enabled: enabled && bounds != null,
    ...QUERY_PRESETS.standard,
    placeholderData: (previousData) => previousData,
  });

// Hook to get total count without bounds filter (for global statistics)
export const useEventsTotalQuery = (filters: FilterState, enabled: boolean = true, scope?: ViewScope) =>
  useQuery({
    queryKey: eventsQueryKeys.list(filters, null, 1, scope), // bounds=null, limit=1 (we only need the total)
    queryFn: ({ signal }) => fetchEventsInternal(filters, null, { limit: 1 }, signal, scope),
    enabled,
    ...QUERY_PRESETS.standard,
  });

export const useMapClustersQuery = (
  filters: FilterState,
  bounds: BoundsType,
  zoom: number,
  enabled: boolean = true,
  scope?: ViewScope,
  density?: ClusterDensitySettings
) =>
  useQuery({
    queryKey: eventsQueryKeys.cluster(filters, bounds, zoom, scope, density),
    queryFn: ({ signal }) => fetchMapClusters(filters, bounds, zoom, signal, scope, density),
    enabled: enabled && bounds != null, // Only run when bounds are available
    ...QUERY_PRESETS.standard,

    placeholderData: (previousData) => previousData, // Show previous data while loading new
  });

/** Fetch sub-cell children of a focused cluster at finer H3 resolution. */
const fetchClusterChildren = async (
  filters: FilterState,
  bounds: BoundsType,
  zoom: number,
  parentCells: string[],
  signal?: AbortSignal,
  scope?: ViewScope,
  density?: ClusterDensitySettings
): Promise<MapClustersResponse> => {
  const extra: Record<string, string> = { zoom: zoom.toString(), parentCells: parentCells.join(",") };
  if (density?.targetClusters != null) extra.targetClusters = density.targetClusters.toString();
  if (density?.clusterAlgorithm != null) extra.clusterAlgorithm = density.clusterAlgorithm;
  if (density?.minPoints != null) extra.minPoints = density.minPoints.toString();
  if (density?.mergeOverlapping != null) extra.mergeOverlapping = density.mergeOverlapping.toString();
  if (density?.h3ResolutionScale != null) extra.h3ResolutionScale = density.h3ResolutionScale.toString();
  const params = buildEventParams(filters, bounds, extra, scope);
  return fetchJson<MapClustersResponse>(`/api/v1/events/geo?${params.toString()}`, { signal });
};

export const useClusterChildrenQuery = (
  filters: FilterState,
  bounds: BoundsType,
  zoom: number,
  parentCells: string[] | null,
  enabled: boolean = true,
  scope?: ViewScope,
  density?: ClusterDensitySettings
) =>
  useQuery({
    queryKey: eventsQueryKeys.clusterChild(filters, bounds, zoom, parentCells ?? [], scope, density),
    queryFn: ({ signal }) => fetchClusterChildren(filters, bounds, zoom, parentCells!, signal, scope, density),
    enabled: enabled && parentCells != null && parentCells.length > 0 && bounds != null,
    ...QUERY_PRESETS.standard,
  });

/**
 * Shape of child feature returned by the H3 hover endpoint — narrow subset
 * used by the hover overlay to build hex polygons.
 */
export interface H3HoverChildFeature {
  id?: string | number;
  properties?: Record<string, unknown>;
}

interface H3HoverResponse {
  features?: H3HoverChildFeature[];
}

/**
 * Fetch H3 child cells for a hovered cluster.
 *
 * Uses pre-built URL search params (typically composed with filters from the
 * current page URL) so hover can share the same filter context as the map
 * without threading full FilterState through the hover hook.
 */
const fetchH3HoverChildren = async (params: URLSearchParams, signal?: AbortSignal): Promise<H3HoverChildFeature[]> => {
  const data = await fetchJson<H3HoverResponse>(`/api/v1/events/geo?${params.toString()}`, { signal });
  return data.features ?? [];
};

/**
 * Hover-triggered query for H3 child cells. Uses `expensive` preset since
 * hover cache benefits from longer retention across re-entries, and children
 * rarely change while the user hovers around the map.
 *
 * Enabled when a clusterId is provided; the params builder must be called
 * by the caller so the hook can treat each (clusterId, zoom, bounds) combo
 * as a distinct cache entry.
 */
export const useH3HoverChildrenQuery = (
  clusterId: string | null,
  parentCells: string[],
  zoom: number,
  boundsKey: string,
  buildParams: () => URLSearchParams,
  enabled: boolean = true
) =>
  useQuery({
    queryKey: eventsQueryKeys.h3HoverChild(clusterId ?? "", parentCells, zoom, boundsKey),
    queryFn: ({ signal }) => fetchH3HoverChildren(buildParams(), signal),
    enabled: enabled && Boolean(clusterId) && parentCells.length > 0,
    ...QUERY_PRESETS.expensive,
  });

/** Fetch summary data for events within specific H3 cells (cluster focus panel). */
const fetchClusterSummary = async (
  filters: FilterState,
  cells: string[],
  h3Resolution: number,
  signal?: AbortSignal,
  scope?: ViewScope
): Promise<ClusterSummaryResponse> => {
  const extra: Record<string, string> = { cells: cells.join(","), h3Resolution: h3Resolution.toString() };
  const params = buildBaseEventParams(filters, extra, scope);
  return fetchJson<ClusterSummaryResponse>(`/api/v1/events/cluster-summary?${params.toString()}`, { signal });
};

export const useClusterSummaryQuery = (
  filters: FilterState,
  cells: string[] | null,
  h3Resolution: number,
  enabled: boolean = true,
  scope?: ViewScope
) =>
  useQuery({
    queryKey: eventsQueryKeys.clusterSummary(filters, cells ?? [], h3Resolution, scope),
    queryFn: ({ signal }) => fetchClusterSummary(filters, cells!, h3Resolution, signal, scope),
    enabled: enabled && cells != null && cells.length > 0,
    ...QUERY_PRESETS.standard,
  });

export const useHistogramQuery = (
  filters: FilterState,
  bounds: BoundsType,
  enabled: boolean = true,
  scope?: ViewScope,
  clusterFilter?: ClusterFilter
): ChartQueryResult<HistogramResponse> => {
  const query = useQuery({
    queryKey: eventsQueryKeys.histogram(filters, bounds, scope, clusterFilter),
    queryFn: ({ signal }) => fetchHistogram(filters, bounds, signal, scope, clusterFilter),
    enabled: enabled && bounds != null,
    ...QUERY_PRESETS.expensive,
    placeholderData: (previousData) => previousData,
  });
  const phase = useLoadingPhase(query.isLoading);
  return { ...query, ...phase };
};

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
  options?: TemporalClusterOptions
): ChartQueryResult<TemporalClustersResponse> => {
  const query = useQuery({
    queryKey: eventsQueryKeys.temporalCluster(filters, bounds, scope, options),
    queryFn: ({ signal }) => fetchTemporalClusters(filters, bounds, signal, scope, options),
    enabled: enabled && bounds != null,
    ...QUERY_PRESETS.expensive,

    placeholderData: (previousData) => previousData,
  });
  const phase = useLoadingPhase(query.isLoading);
  return { ...query, ...phase };
};

/**
 * Hook to fetch histogram data for the full date range (no date or bounds filters).
 *
 * Used by the time range slider to show the complete temporal distribution
 * regardless of the currently selected date range.
 */
/** Strip date range but preserve field filters for the time range slider histogram. */
export const buildFullRangeFilters = (filters: FilterState): FilterState => ({
  ...filters,
  startDate: null,
  endDate: null,
});

export const useFullHistogramQuery = (filters: FilterState, scope?: ViewScope) => {
  const fullRangeFilters = buildFullRangeFilters(filters);

  return useQuery({
    queryKey: eventsQueryKeys.histogramFull(fullRangeFilters, scope),
    queryFn: ({ signal }) => fetchHistogram(fullRangeFilters, null, signal, scope),
    ...QUERY_PRESETS.stable,
  });
};

export const useClusterStatsQuery = (filters: FilterState, enabled: boolean = true, scope?: ViewScope) =>
  useQuery({
    queryKey: eventsQueryKeys.clusterStat(filters, scope),
    queryFn: ({ signal }) => fetchClusterStats(filters, signal, scope),
    enabled,
    ...QUERY_PRESETS.stable,
  });

/**
 * Hook to fetch geographic bounds of all events matching the current filters.
 *
 * Used for initial map positioning and "zoom to data" functionality.
 * Returns the bounding box containing all accessible events.
 *
 * @param filters - Current filter state (catalog, datasets, dates)
 * @param enabled - Whether the query should be enabled
 * @returns React Query result with bounds data
 */
export const useBoundsQuery = (filters: FilterState, enabled: boolean = true, scope?: ViewScope) =>
  useQuery({
    queryKey: eventsQueryKeys.boundsFiltered(filters, scope),
    queryFn: ({ signal }) => fetchBounds(filters, signal, scope),
    enabled,
    ...QUERY_PRESETS.standard,
  });

// Fetch function for unified aggregation endpoint
const fetchAggregation = async (
  filters: FilterState,
  bounds: BoundsType,
  groupBy: "catalog" | "dataset",
  signal?: AbortSignal,
  scope?: ViewScope
): Promise<AggregateResponse> => {
  const params = buildEventParams(filters, bounds, { groupBy }, scope);
  const url = `/api/v1/events/stats?${params.toString()}`;

  logger.debug("Fetching aggregation", { env: process.env.NODE_ENV, groupBy });

  return fetchJson<AggregateResponse>(url, { signal });
};

// Unified aggregation query hook
export const useEventsAggregationQuery = (
  filters: FilterState,
  bounds: BoundsType,
  groupBy: "catalog" | "dataset",
  enabled: boolean = true,
  scope?: ViewScope
): ChartQueryResult<AggregateResponse> => {
  const query = useQuery({
    queryKey: eventsQueryKeys.aggregation(filters, bounds, groupBy, scope),
    queryFn: ({ signal }) => fetchAggregation(filters, bounds, groupBy, signal, scope),
    enabled: enabled && bounds != null,
    ...QUERY_PRESETS.expensive,

    placeholderData: (previousData) => previousData,
  });
  const phase = useLoadingPhase(query.isLoading);
  return { ...query, ...phase };
};

// Infinite query hook for paginated events list
export const useEventsInfiniteQuery = (
  filters: FilterState,
  bounds: BoundsType,
  limit: number = 20,
  enabled: boolean = true,
  scope?: ViewScope
) =>
  useInfiniteQuery({
    queryKey: eventsQueryKeys.infiniteList(filters, bounds, limit, scope),
    queryFn: ({ pageParam, signal }) => fetchEventsInternal(filters, bounds, { page: pageParam, limit }, signal, scope),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    enabled: enabled && bounds != null,
    ...QUERY_PRESETS.standard,
  });

// Helper hook that flattens paginated data for easier consumption
export const useEventsInfiniteFlattened = (
  filters: FilterState,
  bounds: BoundsType,
  limit: number = 20,
  enabled: boolean = true,
  scope?: ViewScope
) => {
  const query = useEventsInfiniteQuery(filters, bounds, limit, enabled, scope);

  // Flatten all pages into a single array
  const events = query.data?.pages ? query.data.pages.flatMap((page) => page.events) : [];

  // Get total from first page (all pages have same total)
  const total = query.data?.pages[0]?.total ?? 0;

  return { ...query, events, total, loadedCount: events.length };
};

// Fetch function for single event by ID
const fetchEventById = async (eventId: number, signal?: AbortSignal): Promise<Event> => {
  logger.debug("Fetching event by ID", { eventId });

  return fetchJson<Event>(`/api/events/${eventId}?depth=2`, { signal });
};

/**
 * Hook to fetch a single event by ID.
 *
 * Used by the event detail modal to fetch full event data when
 * clicking on an event card.
 *
 * @param eventId - The event database ID to fetch
 * @returns React Query result with event data
 */
export const useEventDetailQuery = (eventId: number | null) =>
  useQuery({
    queryKey: eventsQueryKeys.detail(eventId ?? 0),
    queryFn: ({ signal }) => fetchEventById(eventId ?? 0, signal),
    enabled: eventId != null,
    ...QUERY_PRESETS.stable,
    retry: (failureCount, error) => {
      // Don't retry if event not found
      if (error instanceof HttpError && error.status === 404) {
        return false;
      }
      return failureCount < 2;
    },
  });
