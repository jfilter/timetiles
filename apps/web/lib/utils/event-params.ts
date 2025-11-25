/**
 * Shared utilities for extracting and building event filter parameters.
 *
 * This module consolidates common parameter extraction patterns used across
 * event API routes (list, histogram, map-clusters, cluster-stats). By
 * centralizing this logic, we ensure consistent parameter handling and
 * reduce code duplication.
 *
 * @module
 * @category Utils
 */

/**
 * Base parameters common to all event queries.
 */
export interface BaseEventParameters {
  /** Catalog slug or ID to filter by */
  catalog: string | null;
  /** Array of dataset slugs or IDs to filter by */
  datasets: string[];
  /** Start date for temporal filtering (ISO 8601) */
  startDate: string | null;
  /** End date for temporal filtering (ISO 8601) */
  endDate: string | null;
}

/**
 * Parameters for the events list endpoint.
 */
export interface ListParameters extends BaseEventParameters {
  boundsParam: string | null;
  page: number;
  limit: number;
  sort: string;
}

/**
 * Parameters for the histogram endpoint.
 */
export interface HistogramParameters extends BaseEventParameters {
  boundsParam: string | null;
  targetBuckets: number;
  minBuckets: number;
  maxBuckets: number;
}

/**
 * Parameters for the map clusters endpoint.
 */
export interface MapClusterParameters extends BaseEventParameters {
  boundsParam: string | null;
  zoom: number;
}

/**
 * Parameters for the cluster stats endpoint.
 */
export type ClusterStatsParameters = BaseEventParameters;

/**
 * Extract base event parameters from URL search params.
 * These parameters are common to all event API routes.
 *
 * @param searchParams - URL search parameters
 * @returns Base event parameters
 */
export const extractBaseEventParameters = (searchParams: URLSearchParams): BaseEventParameters => ({
  catalog: searchParams.get("catalog"),
  datasets: searchParams.getAll("datasets"),
  startDate: searchParams.get("startDate"),
  endDate: searchParams.get("endDate"),
});

/**
 * Extract parameters for the events list endpoint.
 *
 * @param searchParams - URL search parameters
 * @returns List parameters including pagination and sorting
 */
export const extractListParameters = (searchParams: URLSearchParams): ListParameters => ({
  ...extractBaseEventParameters(searchParams),
  boundsParam: searchParams.get("bounds"),
  page: parseInt(searchParams.get("page") ?? "1", 10),
  limit: Math.min(parseInt(searchParams.get("limit") ?? "100", 10), 1000),
  sort: searchParams.get("sort") ?? "-eventTimestamp",
});

/**
 * Extract parameters for the histogram endpoint.
 *
 * @param searchParams - URL search parameters
 * @returns Histogram parameters including bucket configuration
 */
export const extractHistogramParameters = (searchParams: URLSearchParams): HistogramParameters => ({
  ...extractBaseEventParameters(searchParams),
  boundsParam: searchParams.get("bounds"),
  targetBuckets: parseInt(searchParams.get("targetBuckets") ?? "30", 10),
  minBuckets: parseInt(searchParams.get("minBuckets") ?? "20", 10),
  maxBuckets: parseInt(searchParams.get("maxBuckets") ?? "50", 10),
});

/**
 * Extract parameters for the map clusters endpoint.
 *
 * @param searchParams - URL search parameters
 * @returns Map cluster parameters including zoom level
 */
export const extractMapClusterParameters = (searchParams: URLSearchParams): MapClusterParameters => ({
  ...extractBaseEventParameters(searchParams),
  boundsParam: searchParams.get("bounds"),
  zoom: parseInt(searchParams.get("zoom") ?? "10", 10),
});

/**
 * Extract parameters for the cluster stats endpoint.
 *
 * @param searchParams - URL search parameters
 * @returns Cluster stats parameters (base parameters only)
 */
export const extractClusterStatsParameters = (searchParams: URLSearchParams): ClusterStatsParameters =>
  extractBaseEventParameters(searchParams);
