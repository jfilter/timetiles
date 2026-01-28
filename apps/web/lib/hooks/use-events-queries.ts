/**
 * This file centralizes all TanStack Query (React Query) hooks for fetching events-related data.
 *
 * It defines the data fetching functions, query keys, and custom hooks for various API endpoints,
 * including:
 * - Fetching lists of events.
 * - Retrieving map clusters for efficient visualization of large datasets.
 * - Getting data for temporal histograms.
 * - Polling for the progress of data import jobs.
 * - Handling file uploads for new imports.
 *
 * By co-locating these hooks, it provides a consistent and organized way to manage server state
 * related to events and imports throughout the application.
 *
 * @module
 */
"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";

import type { ClusterFeature } from "@/components/maps/clustered-map";
import type { Event } from "@/payload-types";

import type { FilterState } from "../filters";
import { createLogger } from "../logger";
import type { BoundsType, SimpleBounds } from "../utils/event-params";
import { buildBaseEventParams, buildEventParams } from "../utils/event-params";

// Helper function to determine polling interval
// Returns false to stop polling or number for interval - React Query expects this pattern
// eslint-disable-next-line sonarjs/function-return-type
const getPollingInterval = (query: { state: { data?: { status?: string } } }): number | false => {
  const data = query.state.data;
  if (data?.status === "completed" || data?.status === "failed") {
    return false;
  }
  return 2000;
};

const logger = createLogger("EventsQueries");

// Types for API responses
export interface EventsListResponse {
  events: Event[];
  total: number;
  page: number;
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface MapClustersResponse {
  features: ClusterFeature[];
}

export interface HistogramData {
  date: string; // Bucket start timestamp (ISO 8601)
  dateEnd: string; // Bucket end timestamp (ISO 8601)
  count: number;
}

export interface HistogramResponse {
  histogram: HistogramData[];
  metadata: {
    total: number;
    dateRange: {
      min: string | null;
      max: string | null;
    };
    bucketSizeSeconds: number | null;
    bucketCount: number;
    counts: {
      datasets: number;
      catalogs: number;
    };
    topDatasets: Array<unknown>;
    topCatalogs: Array<unknown>;
  };
}

export interface AggregationItem {
  id: number | string;
  name: string;
  count: number;
}

export interface AggregationResponse {
  items: AggregationItem[];
  total: number;
  groupedBy: string;
}

export interface ImportJobProgress {
  id: string;
  datasetId: string;
  datasetName?: string;
  stage: string;
  progress: number;
  rowsTotal: number;
  rowsProcessed: number;
  batchNumber: number;
  errors: number;
  duplicates: {
    internal: number;
    external: number;
  };
  schemaValidation?: Record<string, unknown>;
  results?: Record<string, unknown>;
}

export interface ImportProgressResponse {
  type: "import-file";
  id: string;
  status: string;
  originalName: string;
  datasetsCount: number;
  datasetsProcessed: number;
  overallProgress: number;
  jobs: ImportJobProgress[];
  errorLog?: string;
  completedAt?: string;
  createdAt?: string;
}

export interface ClusterStatsResponse {
  p20: number;
  p40: number;
  p60: number;
  p80: number;
  p100: number;
}

export interface BoundsResponse {
  bounds: SimpleBounds | null;
  count: number;
}

// Re-export types for consumers of this module
export type { BoundsType, SimpleBounds };

// Fetch functions
const fetchEvents = async (
  filters: FilterState,
  bounds: BoundsType,
  limit: number = 1000,
  signal?: AbortSignal
): Promise<EventsListResponse> => {
  const params = buildEventParams(filters, bounds, { limit: limit.toString() });

  logger.debug("Fetching events list", { filters, bounds, limit });

  const response = await fetch(`/api/v1/events?${params.toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }

  const data = await response.json();

  // Transform API response to match EventsListResponse interface
  return {
    events: data.events,
    total: data.pagination.totalDocs,
    page: data.pagination.page,
    limit: data.pagination.limit,
    hasNextPage: data.pagination.hasNextPage,
    hasPrevPage: data.pagination.hasPrevPage,
  };
};

const fetchMapClusters = async (
  filters: FilterState,
  bounds: BoundsType,
  zoom: number,
  signal?: AbortSignal
): Promise<MapClustersResponse> => {
  const params = buildEventParams(filters, bounds, { zoom: zoom.toString() });

  logger.debug("Fetching map clusters", { filters, bounds, zoom });

  const response = await fetch(`/api/v1/events/geo?${params.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`Failed to fetch map clusters: ${response.statusText}`);
  }

  return response.json() as Promise<MapClustersResponse>;
};

const fetchHistogram = async (
  filters: FilterState,
  bounds: BoundsType,
  signal?: AbortSignal
): Promise<HistogramResponse> => {
  const params = buildEventParams(filters, bounds);

  logger.debug("Fetching histogram", { filters, bounds });

  const response = await fetch(`/api/v1/events/temporal?${params.toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch histogram: ${response.statusText}`);
  }

  return response.json() as Promise<HistogramResponse>;
};

const fetchClusterStats = async (filters: FilterState, signal?: AbortSignal): Promise<ClusterStatsResponse> => {
  const params = buildBaseEventParams(filters);

  logger.debug("Fetching global cluster stats", { filters });

  const response = await fetch(`/api/v1/events/geo/stats?${params.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`Failed to fetch cluster stats: ${response.statusText}`);
  }

  return response.json() as Promise<ClusterStatsResponse>;
};

const fetchBounds = async (filters: FilterState, signal?: AbortSignal): Promise<BoundsResponse> => {
  const params = buildBaseEventParams(filters);

  logger.debug("Fetching event bounds", { filters });

  const response = await fetch(`/api/v1/events/bounds?${params.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`Failed to fetch event bounds: ${response.statusText}`);
  }

  return response.json() as Promise<BoundsResponse>;
};

const fetchImportProgress = async (importId: string, signal?: AbortSignal): Promise<ImportProgressResponse> => {
  logger.debug("Fetching import progress", { importId });

  const response = await fetch(`/api/import/${importId}/progress`, { signal });

  if (!response.ok) {
    throw new Error(`Failed to fetch import progress: ${response.statusText}`);
  }

  return response.json() as Promise<ImportProgressResponse>;
};

const uploadImport = async (
  formData: FormData,
  signal?: AbortSignal
): Promise<{ importId: string; success: boolean }> => {
  logger.debug("Uploading import file via Payload endpoint");

  // Convert to Payload's expected format
  const payloadFormData = new FormData();

  // Get the file from the original FormData
  const file = formData.get("file");
  if (file) {
    payloadFormData.append("file", file);
  }

  // Get other fields and put them in _payload as JSON
  const catalogId = formData.get("catalogId");
  const sessionId = formData.get("sessionId");

  const payloadData = {
    catalog: catalogId ? parseInt(catalogId as string, 10) : undefined,
    sessionId: sessionId ?? undefined,
    status: "pending",
    datasetsCount: 0,
    datasetsProcessed: 0,
  };

  payloadFormData.append("_payload", JSON.stringify(payloadData));

  const response = await fetch("/api/import-files", {
    method: "POST",
    body: payloadFormData,
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload import: ${response.statusText}`);
  }

  const result = await response.json();
  return {
    importId: result.doc?.id ?? result.id,
    success: true,
  };
};

// Query key factories
export const eventsQueryKeys = {
  all: ["events"] as const,
  detail: (eventId: number) => [...eventsQueryKeys.all, "detail", eventId] as const,
  lists: () => [...eventsQueryKeys.all, "list"] as const,
  list: (filters: FilterState, bounds: BoundsType, limit: number) =>
    [...eventsQueryKeys.lists(), { filters, bounds, limit }] as const,
  infinite: () => [...eventsQueryKeys.all, "infinite"] as const,
  infiniteList: (filters: FilterState, bounds: BoundsType, limit: number) =>
    [...eventsQueryKeys.infinite(), { filters, bounds, limit }] as const,
  clusters: () => [...eventsQueryKeys.all, "clusters"] as const,
  cluster: (filters: FilterState, bounds: BoundsType, zoom: number) =>
    [...eventsQueryKeys.clusters(), { filters, bounds, zoom }] as const,
  clusterStats: () => [...eventsQueryKeys.all, "cluster-stats"] as const,
  clusterStat: (filters: FilterState) => [...eventsQueryKeys.clusterStats(), { filters }] as const,
  histograms: () => [...eventsQueryKeys.all, "histogram"] as const,
  histogram: (filters: FilterState, bounds: BoundsType) =>
    [...eventsQueryKeys.histograms(), { filters, bounds }] as const,
  aggregations: () => [...eventsQueryKeys.all, "aggregation"] as const,
  aggregation: (filters: FilterState, bounds: BoundsType, groupBy: "catalog" | "dataset") =>
    [...eventsQueryKeys.aggregations(), { filters, bounds, groupBy }] as const,
  imports: () => ["imports"] as const,
  importProgress: (importId: string) => [...eventsQueryKeys.imports(), "progress", importId] as const,
  bounds: () => [...eventsQueryKeys.all, "bounds"] as const,
  boundsFiltered: (filters: FilterState) => [...eventsQueryKeys.bounds(), { filters }] as const,
};

// Query hooks
export const useEventsListQuery = (
  filters: FilterState,
  bounds: BoundsType,
  limit: number = 1000,
  enabled: boolean = true
) =>
  useQuery({
    queryKey: eventsQueryKeys.list(filters, bounds, limit),
    queryFn: ({ signal }) => fetchEvents(filters, bounds, limit, signal),
    enabled: enabled && bounds != null, // Only run when bounds are available
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData, // Show previous data while loading new
  });

// Hook to get total count without bounds filter (for global statistics)
export const useEventsTotalQuery = (filters: FilterState, enabled: boolean = true) =>
  useQuery({
    queryKey: eventsQueryKeys.list(filters, null, 1), // bounds=null, limit=1 (we only need the total)
    queryFn: ({ signal }) => fetchEvents(filters, null, 1, signal),
    enabled,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

export const useMapClustersQuery = (filters: FilterState, bounds: BoundsType, zoom: number, enabled: boolean = true) =>
  useQuery({
    queryKey: eventsQueryKeys.cluster(filters, bounds, zoom),
    queryFn: ({ signal }) => fetchMapClusters(filters, bounds, zoom, signal),
    enabled: enabled && bounds != null, // Only run when bounds are available
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData, // Show previous data while loading new
  });

export const useHistogramQuery = (filters: FilterState, bounds: BoundsType, enabled: boolean = true) =>
  useQuery({
    queryKey: eventsQueryKeys.histogram(filters, bounds),
    queryFn: ({ signal }) => fetchHistogram(filters, bounds, signal),
    enabled: enabled && bounds != null, // Only run when bounds are available
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData, // Show previous data while loading new
  });

export const useClusterStatsQuery = (filters: FilterState, enabled: boolean = true) =>
  useQuery({
    queryKey: eventsQueryKeys.clusterStat(filters),
    queryFn: ({ signal }) => fetchClusterStats(filters, signal),
    enabled,
    staleTime: 5 * 60 * 1000, // 5 minutes - stats change less frequently
    gcTime: 30 * 60 * 1000, // 30 minutes
    refetchOnWindowFocus: false,
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
export const useBoundsQuery = (filters: FilterState, enabled: boolean = true) =>
  useQuery({
    queryKey: eventsQueryKeys.boundsFiltered(filters),
    queryFn: ({ signal }) => fetchBounds(filters, signal),
    enabled,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

export const useImportProgressQuery = (importId: string | null) =>
  useQuery({
    queryKey: eventsQueryKeys.importProgress(importId!),
    queryFn: ({ signal }) => fetchImportProgress(importId!, signal),
    enabled: importId != null,
    refetchInterval: (query) => getPollingInterval(query),
    retry: 3,
    staleTime: 0, // Always fresh for progress updates
    gcTime: 30 * 1000, // Clean up quickly after completion
  });

// Mutation hooks
export const useImportUploadMutation = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ formData, signal }: { formData: FormData; signal?: AbortSignal }) => uploadImport(formData, signal),
    onSuccess: (data) => {
      logger.info("Import upload successful", { importId: data.importId });
      // Invalidate import progress queries to start polling
      void queryClient.invalidateQueries({
        queryKey: eventsQueryKeys.importProgress(data.importId),
      });
    },
    onError: (error) => {
      logger.error("Import upload failed", error);
    },
  });
};

// Utility hook to invalidate related queries when data changes
export const useInvalidateEventsQueries = () => {
  const queryClient = useQueryClient();

  return {
    invalidateAll: () => {
      void queryClient.invalidateQueries({ queryKey: eventsQueryKeys.all });
    },
    invalidateLists: () => {
      void queryClient.invalidateQueries({ queryKey: eventsQueryKeys.lists() });
    },
    invalidateClusters: () => {
      void queryClient.invalidateQueries({
        queryKey: eventsQueryKeys.clusters(),
      });
    },
    invalidateHistograms: () => {
      void queryClient.invalidateQueries({
        queryKey: eventsQueryKeys.histograms(),
      });
    },
  };
};

// Fetch function for unified aggregation endpoint
const fetchAggregation = async (
  filters: FilterState,
  bounds: BoundsType,
  groupBy: "catalog" | "dataset",
  signal?: AbortSignal
): Promise<AggregationResponse> => {
  const params = buildEventParams(filters, bounds, { groupBy });
  const url = `/api/v1/events/stats?${params.toString()}`;

  logger.debug("Fetching aggregation", { env: process.env.NODE_ENV, groupBy });

  const response = await fetch(url, { signal });

  if (!response.ok) {
    throw new Error(`Failed to fetch aggregation: ${response.statusText}`);
  }

  return response.json();
};

// Unified aggregation query hook
export const useEventsAggregationQuery = (
  filters: FilterState,
  bounds: BoundsType,
  groupBy: "catalog" | "dataset",
  enabled: boolean = true
) =>
  useQuery({
    queryKey: eventsQueryKeys.aggregation(filters, bounds, groupBy),
    queryFn: ({ signal }) => fetchAggregation(filters, bounds, groupBy, signal),
    enabled: enabled && bounds != null,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData,
  });

// Fetch function with page support for infinite queries
const fetchEventsPage = async (
  filters: FilterState,
  bounds: BoundsType,
  page: number,
  limit: number = 20,
  signal?: AbortSignal
): Promise<EventsListResponse> => {
  const params = buildEventParams(filters, bounds, {
    limit: limit.toString(),
    page: page.toString(),
  });

  logger.debug("Fetching events page", { filters, bounds, page, limit });

  const response = await fetch(`/api/v1/events?${params.toString()}`, { signal });

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    events: data.events,
    total: data.pagination.totalDocs,
    page: data.pagination.page,
    limit: data.pagination.limit,
    hasNextPage: data.pagination.hasNextPage,
    hasPrevPage: data.pagination.hasPrevPage,
  };
};

// Infinite query hook for paginated events list
export const useEventsInfiniteQuery = (
  filters: FilterState,
  bounds: BoundsType,
  limit: number = 20,
  enabled: boolean = true
) =>
  useInfiniteQuery({
    queryKey: eventsQueryKeys.infiniteList(filters, bounds, limit),
    queryFn: ({ pageParam, signal }) => fetchEventsPage(filters, bounds, pageParam, limit, signal),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => (lastPage.hasNextPage ? lastPage.page + 1 : undefined),
    enabled: enabled && bounds != null,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

// Helper hook that flattens paginated data for easier consumption
export const useEventsInfiniteFlattened = (
  filters: FilterState,
  bounds: BoundsType,
  limit: number = 20,
  enabled: boolean = true
) => {
  const query = useEventsInfiniteQuery(filters, bounds, limit, enabled);

  // Flatten all pages into a single array
  const events = useMemo(() => {
    if (!query.data?.pages) return [];
    return query.data.pages.flatMap((page) => page.events);
  }, [query.data?.pages]);

  // Get total from first page (all pages have same total)
  const total = query.data?.pages[0]?.total ?? 0;

  return {
    ...query,
    events,
    total,
    loadedCount: events.length,
  };
};

// Fetch function for single event by ID
const fetchEventById = async (eventId: number, signal?: AbortSignal): Promise<Event> => {
  logger.debug("Fetching event by ID", { eventId });

  const response = await fetch(`/api/events/${eventId}?depth=2`, { signal });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Event not found");
    }
    throw new Error(`Failed to fetch event: ${response.statusText}`);
  }

  return response.json() as Promise<Event>;
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
    queryKey: eventsQueryKeys.detail(eventId!),
    queryFn: ({ signal }) => fetchEventById(eventId!, signal),
    enabled: eventId != null,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
    retry: (failureCount, error) => {
      // Don't retry if event not found
      if (error instanceof Error && error.message.includes("not found")) {
        return false;
      }
      return failureCount < 2;
    },
  });
