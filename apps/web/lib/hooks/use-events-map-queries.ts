/**
 * Spatial events queries backing the map: clusters, their children, hover detail,
 * the focus-panel summary, global cluster stats and the data's bounding box.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useQuery } from "@tanstack/react-query";

import type { ClusterStatsResponse, ClusterSummaryResponse, MapClustersResponse } from "@/lib/schemas/events";

import { fetchJson } from "../api/http-error";
import { createLogger } from "../logger";
import type { BoundsResponse } from "../types/event-bounds";
import type { FilterState } from "../types/filter-state";
import type { BoundsType, ViewScope } from "../utils/event-params";
import { buildBaseEventParams, buildEventParams } from "../utils/event-params";
import type { ClusterDensitySettings } from "./events-query-keys";
import { eventsQueryKeys } from "./events-query-keys";
import { QUERY_PRESETS } from "./query-presets";

const logger = createLogger("EventsQueries");

/** Density settings are query params on `/geo`; absent fields fall back to the API defaults. */
const appendDensityParams = (extra: Record<string, string>, density?: ClusterDensitySettings): void => {
  if (density?.targetClusters != null) extra.targetClusters = density.targetClusters.toString();
  if (density?.clusterAlgorithm != null) extra.clusterAlgorithm = density.clusterAlgorithm;
  if (density?.minPoints != null) extra.minPoints = density.minPoints.toString();
  if (density?.mergeOverlapping != null) extra.mergeOverlapping = density.mergeOverlapping.toString();
  if (density?.h3ResolutionScale != null) extra.h3ResolutionScale = density.h3ResolutionScale.toString();
};

const fetchMapClusters = async (
  filters: FilterState,
  bounds: BoundsType,
  zoom: number,
  signal?: AbortSignal,
  scope?: ViewScope,
  density?: ClusterDensitySettings
): Promise<MapClustersResponse> => {
  const extra: Record<string, string> = { zoom: zoom.toString() };
  appendDensityParams(extra, density);
  if (density?.useHexCenter) extra.useHexCenter = "true";
  const params = buildEventParams(filters, bounds, extra, scope);

  logger.debug("Fetching map clusters", { filters, bounds, zoom });

  return fetchJson<MapClustersResponse>(`/api/v1/events/geo?${params.toString()}`, { signal });
};

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
  appendDensityParams(extra, density);
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
) => {
  const hasHoverTarget = enabled && Boolean(clusterId) && parentCells.length > 0;
  const paramsKey = hasHoverTarget ? buildParams().toString() : "";

  return useQuery({
    queryKey: [...eventsQueryKeys.h3HoverChild(clusterId ?? "", parentCells, zoom, boundsKey), paramsKey],
    queryFn: ({ signal }) => fetchH3HoverChildren(new URLSearchParams(paramsKey), signal),
    enabled: hasHoverTarget,
    ...QUERY_PRESETS.expensive,
  });
};

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

const fetchClusterStats = async (
  filters: FilterState,
  signal?: AbortSignal,
  scope?: ViewScope
): Promise<ClusterStatsResponse> => {
  const params = buildBaseEventParams(filters, {}, scope);

  logger.debug("Fetching global cluster stats", { filters });

  return fetchJson<ClusterStatsResponse>(`/api/v1/events/geo/stats?${params.toString()}`, { signal });
};

export const useClusterStatsQuery = (filters: FilterState, enabled: boolean = true, scope?: ViewScope) =>
  useQuery({
    queryKey: eventsQueryKeys.clusterStat(filters, scope),
    queryFn: ({ signal }) => fetchClusterStats(filters, signal, scope),
    enabled,
    ...QUERY_PRESETS.stable,
  });

const fetchBounds = async (filters: FilterState, signal?: AbortSignal, scope?: ViewScope): Promise<BoundsResponse> => {
  const params = buildBaseEventParams(filters, {}, scope);

  logger.debug("Fetching event bounds", { filters });

  return fetchJson<BoundsResponse>(`/api/v1/events/bounds?${params.toString()}`, { signal });
};

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
