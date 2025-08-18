/**
 * @module This file centralizes all TanStack Query (React Query) hooks for fetching events-related data.
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
 */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LngLatBounds } from "maplibre-gl";

import type { ClusterFeature } from "@/components/clustered-map";
import type { Event } from "@/payload-types";

import type { FilterState } from "../filters";
import { createLogger } from "../logger";

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
  date: string;
  count: number;
}

export interface HistogramResponse {
  histogram: HistogramData[];
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
  geocodingProgress?: Record<string, unknown>;
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

// Simple bounds interface for better React Query compatibility
export interface SimpleBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

// Type alias for bounds to satisfy sonarjs rule
type BoundsType = LngLatBounds | SimpleBounds | null;

// Helper to build query parameters
const buildEventParams = (
  filters: FilterState,
  bounds: BoundsType,
  additionalParams: Record<string, string> = {}
): URLSearchParams => {
  const params = new URLSearchParams();

  // Add filters
  if (filters.catalog != null && filters.catalog !== "") {
    params.append("catalog", filters.catalog);
  }

  filters.datasets.forEach((datasetId) => {
    params.append("datasets", datasetId);
  });

  if (filters.startDate != null && filters.startDate !== "") {
    params.append("startDate", filters.startDate);
  }

  if (filters.endDate != null && filters.endDate !== "") {
    params.append("endDate", filters.endDate);
  }

  // Add bounds - handle both LngLatBounds and SimpleBounds
  if (bounds) {
    const boundsData =
      "getWest" in bounds
        ? {
            west: bounds.getWest(),
            south: bounds.getSouth(),
            east: bounds.getEast(),
            north: bounds.getNorth(),
          }
        : bounds;

    params.append("bounds", JSON.stringify(boundsData));
  } else {
    // Use default NYC area bounds if no bounds are available yet
    params.append(
      "bounds",
      JSON.stringify({
        west: -74.2,
        south: 40.5,
        east: -73.6,
        north: 40.9,
      })
    );
  }

  // Add additional parameters
  Object.entries(additionalParams).forEach(([key, value]) => {
    params.append(key, value);
  });

  return params;
};

// Fetch functions
const fetchEvents = async (
  filters: FilterState,
  bounds: BoundsType,
  limit: number = 1000,
  signal?: AbortSignal
): Promise<EventsListResponse> => {
  const params = buildEventParams(filters, bounds, { limit: limit.toString() });

  logger.debug("Fetching events list", { filters, bounds, limit });

  const response = await fetch(`/api/events/list?${params.toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch events: ${response.statusText}`);
  }

  return response.json() as Promise<EventsListResponse>;
};

const fetchMapClusters = async (
  filters: FilterState,
  bounds: BoundsType,
  zoom: number,
  signal?: AbortSignal
): Promise<MapClustersResponse> => {
  const params = buildEventParams(filters, bounds, { zoom: zoom.toString() });

  logger.debug("Fetching map clusters", { filters, bounds, zoom });

  const response = await fetch(`/api/events/map-clusters?${params.toString()}`, { signal });

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

  const response = await fetch(`/api/events/histogram?${params.toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch histogram: ${response.statusText}`);
  }

  return response.json() as Promise<HistogramResponse>;
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
  const datasetId = formData.get("datasetId");
  const sessionId = formData.get("sessionId");

  const payloadData = {
    catalog: catalogId ? parseInt(catalogId as string, 10) : undefined,
    sessionId: sessionId || undefined,
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
    importId: result.doc?.id || result.id,
    success: true,
  };
};

// Query key factories
export const eventsQueryKeys = {
  all: ["events"] as const,
  lists: () => [...eventsQueryKeys.all, "list"] as const,
  list: (filters: FilterState, bounds: BoundsType, limit: number) =>
    [...eventsQueryKeys.lists(), { filters, bounds, limit }] as const,
  clusters: () => [...eventsQueryKeys.all, "clusters"] as const,
  cluster: (filters: FilterState, bounds: BoundsType, zoom: number) =>
    [...eventsQueryKeys.clusters(), { filters, bounds, zoom }] as const,
  histograms: () => [...eventsQueryKeys.all, "histogram"] as const,
  histogram: (filters: FilterState, bounds: BoundsType) =>
    [...eventsQueryKeys.histograms(), { filters, bounds }] as const,
  imports: () => ["imports"] as const,
  importProgress: (importId: string) => [...eventsQueryKeys.imports(), "progress", importId] as const,
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
    enabled,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

export const useMapClustersQuery = (filters: FilterState, bounds: BoundsType, zoom: number, enabled: boolean = true) =>
  useQuery({
    queryKey: eventsQueryKeys.cluster(filters, bounds, zoom),
    queryFn: ({ signal }) => fetchMapClusters(filters, bounds, zoom, signal),
    enabled,
    staleTime: 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  });

export const useHistogramQuery = (filters: FilterState, bounds: BoundsType, enabled: boolean = true) =>
  useQuery({
    queryKey: eventsQueryKeys.histogram(filters, bounds),
    queryFn: ({ signal }) => fetchHistogram(filters, bounds, signal),
    enabled,
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
    refetchOnWindowFocus: false,
    placeholderData: (previousData) => previousData, // Show previous data while loading new
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
