/**
 * Events list queries: bounded list, global total, and the paginated infinite list.
 *
 * All three read `/api/v1/events` through one fetcher, so the list underneath the map
 * and the counts around it cannot disagree about what a filter means.
 *
 * @module
 * @category Hooks
 */
"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

import type { EventListItem } from "@/lib/schemas/events";

import { fetchJson } from "../api/http-error";
import { createLogger } from "../logger";
import type { FilterState } from "../types/filter-state";
import type { BoundsType, ViewScope } from "../utils/event-params";
import { buildEventParams } from "../utils/event-params";
import type { ClusterFilter } from "./events-query-keys";
import { eventsQueryKeys } from "./events-query-keys";
import { QUERY_PRESETS } from "./query-presets";

const logger = createLogger("EventsQueries");

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

// Infinite query hook for paginated events list.
//
// `clusterFilter` is not optional in practice: the map, charts and the list description all
// honour a clicked H3 cell, and without it here the list underneath kept showing every event
// of the base filters — two contradictory counts on one screen.
export const useEventsInfiniteQuery = (
  filters: FilterState,
  bounds: BoundsType,
  limit: number = 20,
  enabled: boolean = true,
  scope?: ViewScope,
  clusterFilter?: ClusterFilter
) =>
  useInfiniteQuery({
    queryKey: eventsQueryKeys.infiniteList(filters, bounds, limit, scope, clusterFilter),
    queryFn: ({ pageParam, signal }) =>
      fetchEventsInternal(filters, bounds, { page: pageParam, limit }, signal, scope, clusterFilter),
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
  scope?: ViewScope,
  clusterFilter?: ClusterFilter
) => {
  const query = useEventsInfiniteQuery(filters, bounds, limit, enabled, scope, clusterFilter);

  // Flatten all pages into a single array
  const events = query.data?.pages ? query.data.pages.flatMap((page) => page.events) : [];

  // Get total from first page (all pages have same total)
  const total = query.data?.pages[0]?.total ?? 0;

  return { ...query, events, total, loadedCount: events.length };
};
