/**
 * OpenAPI registry for automatic spec generation.
 *
 * This module registers all API routes with their schemas for OpenAPI generation.
 * Routes are registered using Zod schemas that provide both validation and documentation.
 *
 * @module
 * @category OpenAPI
 */
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";

import { ErrorResponseSchema } from "../schemas/common";
import {
  AggregateQuerySchema,
  AggregateResponseSchema,
  ClusterStatsQuerySchema,
  ClusterStatsResponseSchema,
  EventListQuerySchema,
  EventListResponseSchema,
  HistogramQuerySchema,
  HistogramResponseSchema,
  MapClustersQuerySchema,
  MapClustersResponseSchema,
} from "../schemas/events";

export const registry = new OpenAPIRegistry();

// Common response descriptions
const DESCRIPTIONS = {
  BAD_REQUEST: "Invalid request parameters",
  INTERNAL_ERROR: "Internal server error",
} as const;

// Common error response content
const errorResponse = (schema = ErrorResponseSchema) => ({
  content: {
    "application/json": {
      schema,
    },
  },
});

// =============================================================================
// Event API Routes
// =============================================================================

registry.registerPath({
  method: "get",
  path: "/api/v1/events",
  tags: ["Events"],
  summary: "List events with pagination",
  description:
    "Returns a paginated list of events matching the specified filters. Events are returned with enriched data including extracted title, description, and location.",
  request: {
    query: EventListQuerySchema,
  },
  responses: {
    200: {
      description: "Paginated event list",
      content: { "application/json": { schema: EventListResponseSchema } },
    },
    400: { description: DESCRIPTIONS.BAD_REQUEST, ...errorResponse() },
    500: { description: DESCRIPTIONS.INTERNAL_ERROR, ...errorResponse() },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/events/stats",
  tags: ["Events"],
  summary: "Aggregate event counts by catalog or dataset",
  description:
    "Returns event counts grouped by catalog or dataset. When datasets are explicitly filtered, all selected datasets appear in results (with 0 count if no events match in the current viewport).",
  request: {
    query: AggregateQuerySchema,
  },
  responses: {
    200: {
      description: "Aggregated event counts",
      content: { "application/json": { schema: AggregateResponseSchema } },
    },
    400: { description: DESCRIPTIONS.BAD_REQUEST, ...errorResponse() },
    500: { description: DESCRIPTIONS.INTERNAL_ERROR, ...errorResponse() },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/events/temporal",
  tags: ["Events"],
  summary: "Get temporal histogram of events",
  description:
    "Returns a histogram of event counts over time with automatically calculated bucket sizes. The bucket size is optimized based on the target, min, and max bucket parameters.",
  request: {
    query: HistogramQuerySchema,
  },
  responses: {
    200: {
      description: "Temporal histogram data",
      content: { "application/json": { schema: HistogramResponseSchema } },
    },
    400: { description: DESCRIPTIONS.BAD_REQUEST, ...errorResponse() },
    500: { description: DESCRIPTIONS.INTERNAL_ERROR, ...errorResponse() },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/events/geo",
  tags: ["Events"],
  summary: "Get clustered events for map display",
  description:
    "Returns events clustered based on zoom level and viewport bounds. Uses server-side PostGIS clustering for optimal performance with large datasets. Returns a GeoJSON FeatureCollection.",
  request: {
    query: MapClustersQuerySchema,
  },
  responses: {
    200: {
      description: "GeoJSON FeatureCollection of clustered events",
      content: { "application/json": { schema: MapClustersResponseSchema } },
    },
    400: { description: DESCRIPTIONS.BAD_REQUEST, ...errorResponse() },
    500: { description: DESCRIPTIONS.INTERNAL_ERROR, ...errorResponse() },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/events/geo/stats",
  tags: ["Events"],
  summary: "Get cluster statistics for visualization",
  description:
    "Returns percentile breakpoints for cluster sizes across the entire filtered dataset. Used to maintain consistent cluster visualization across all zoom levels and viewports.",
  request: {
    query: ClusterStatsQuerySchema,
  },
  responses: {
    200: {
      description: "Cluster size percentile statistics",
      content: { "application/json": { schema: ClusterStatsResponseSchema } },
    },
    500: { description: DESCRIPTIONS.INTERNAL_ERROR, ...errorResponse() },
  },
});

// =============================================================================
// Sources API Routes
// =============================================================================

registry.registerPath({
  method: "get",
  path: "/api/v1/sources/stats",
  tags: ["Sources"],
  summary: "Get data source statistics",
  description:
    "Returns event counts grouped by catalog and dataset. Used to display total event counts for each data source in the filter UI.",
  responses: {
    200: {
      description: "Data source statistics",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              catalogCounts: {
                type: "object",
                additionalProperties: { type: "integer" },
              },
              datasetCounts: {
                type: "object",
                additionalProperties: { type: "integer" },
              },
              totalEvents: { type: "integer" },
            },
            required: ["catalogCounts", "datasetCounts", "totalEvents"],
          },
        },
      },
    },
    500: { description: DESCRIPTIONS.INTERNAL_ERROR, ...errorResponse() },
  },
});

// =============================================================================
// Health & Status Routes
// =============================================================================

registry.registerPath({
  method: "get",
  path: "/api/health",
  tags: ["System"],
  summary: "Health check endpoint",
  description: "Returns the health status of the API and its dependencies.",
  responses: {
    200: {
      description: "Service is healthy",
      content: {
        "application/json": {
          schema: {
            type: "object",
            properties: {
              status: { type: "string", example: "ok" },
              timestamp: { type: "string", format: "date-time" },
            },
          },
        },
      },
    },
  },
});
