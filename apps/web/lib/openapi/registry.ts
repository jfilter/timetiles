/**
 * OpenAPI registry for automatic spec generation.
 *
 * Registers the public API routes documented in the generated OpenAPI spec, using
 * the same Zod schemas that validate their requests and responses.
 *
 * @module
 * @category OpenAPI
 */
import { OpenAPIRegistry } from "@asteasolutions/zod-to-openapi";
import { z } from "zod";

import { ErrorResponseSchema } from "../schemas/common";
import { DataSourcesQuerySchema, DataSourcesResponseSchema } from "../schemas/data-sources";
import {
  AggregateQuerySchema,
  AggregateResponseSchema,
  BoundsQuerySchema,
  BoundsResponseSchema,
  ClusterStatsQuerySchema,
  ClusterStatsResponseSchema,
  EventListQuerySchema,
  EventListResponseSchema,
  HistogramQuerySchema,
  HistogramResponseSchema,
  MapClustersQuerySchema,
  MapClustersResponseSchema,
} from "../schemas/events";
import { SchemaInferenceBodySchema, SchemaInferenceResponseSchema } from "../schemas/schema-inference";

export const registry = new OpenAPIRegistry();

// Common response descriptions
const DESCRIPTIONS = {
  INVALID_PARAMETERS: "Invalid request parameters",
  INTERNAL_ERROR: "Internal server error",
} as const;

// Common error response content
const errorResponse = (schema = ErrorResponseSchema) => ({ content: { "application/json": { schema } } });

// Liveness answers with the same body on success and failure; only the status code differs
const livenessResponse = {
  content: {
    "application/json": {
      schema: z
        .object({ status: z.enum(["ok", "error"]), database: z.enum(["connected", "error"]) })
        .openapi("LivenessResponse"),
    },
  },
};

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
  request: { query: EventListQuerySchema },
  responses: {
    200: { description: "Paginated event list", content: { "application/json": { schema: EventListResponseSchema } } },
    422: { description: DESCRIPTIONS.INVALID_PARAMETERS, ...errorResponse() },
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
  request: { query: AggregateQuerySchema },
  responses: {
    200: {
      description: "Aggregated event counts",
      content: { "application/json": { schema: AggregateResponseSchema } },
    },
    422: { description: DESCRIPTIONS.INVALID_PARAMETERS, ...errorResponse() },
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
  request: { query: HistogramQuerySchema },
  responses: {
    200: {
      description: "Temporal histogram data",
      content: { "application/json": { schema: HistogramResponseSchema } },
    },
    422: { description: DESCRIPTIONS.INVALID_PARAMETERS, ...errorResponse() },
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
  request: { query: MapClustersQuerySchema },
  responses: {
    200: {
      description: "GeoJSON FeatureCollection of clustered events",
      content: { "application/json": { schema: MapClustersResponseSchema } },
    },
    422: { description: DESCRIPTIONS.INVALID_PARAMETERS, ...errorResponse() },
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
  request: { query: ClusterStatsQuerySchema },
  responses: {
    200: {
      description: "Cluster size percentile statistics",
      content: { "application/json": { schema: ClusterStatsResponseSchema } },
    },
    422: { description: DESCRIPTIONS.INVALID_PARAMETERS, ...errorResponse() },
    500: { description: DESCRIPTIONS.INTERNAL_ERROR, ...errorResponse() },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/events/bounds",
  tags: ["Events"],
  summary: "Get the geographic bounds of filtered events",
  description:
    "Returns the bounding box of all located events matching the filters, or null bounds when none match. West is greater than east when the box crosses the antimeridian.",
  request: { query: BoundsQuerySchema },
  responses: {
    200: {
      description: "Bounding box and event count",
      content: { "application/json": { schema: BoundsResponseSchema } },
    },
    422: { description: DESCRIPTIONS.INVALID_PARAMETERS, ...errorResponse() },
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
              catalogCounts: { type: "object", additionalProperties: { type: "integer" } },
              datasetCounts: { type: "object", additionalProperties: { type: "integer" } },
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

registry.registerPath({
  method: "get",
  path: "/api/v1/data-sources",
  tags: ["Sources"],
  summary: "List catalogs and datasets",
  description:
    "Returns every catalog and one page of datasets visible to the caller, with the metadata the filter UI needs.",
  request: { query: DataSourcesQuerySchema },
  responses: {
    200: {
      description: "Catalogs and a page of datasets",
      content: { "application/json": { schema: DataSourcesResponseSchema } },
    },
    422: { description: DESCRIPTIONS.INVALID_PARAMETERS, ...errorResponse() },
    500: { description: DESCRIPTIONS.INTERNAL_ERROR, ...errorResponse() },
  },
});

// =============================================================================
// Dataset API Routes
// =============================================================================

registry.registerPath({
  method: "post",
  path: "/api/v1/datasets/{id}/schema/infer",
  tags: ["Datasets"],
  summary: "Infer a dataset schema from its events",
  description:
    "Samples existing events to generate a schema version for a dataset created outside the import pipeline. Requires an editor or admin session.",
  request: {
    params: z.object({ id: z.string().openapi({ description: "Dataset ID", example: "42" }) }),
    body: { content: { "application/json": { schema: SchemaInferenceBodySchema } } },
  },
  responses: {
    200: {
      description: "Inference result",
      content: { "application/json": { schema: SchemaInferenceResponseSchema } },
    },
    400: { description: "Invalid dataset ID", ...errorResponse() },
    401: { description: "Authentication required", ...errorResponse() },
    403: { description: "Editor or admin role required", ...errorResponse() },
    404: { description: "Dataset not found", ...errorResponse() },
    422: { description: "Invalid request body", ...errorResponse() },
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
  summary: "Liveness check endpoint",
  description:
    "Reports whether the API can reach its database. Full diagnostics are available to admins at /api/admin/health.",
  responses: {
    200: { description: "Service is live", ...livenessResponse },
    500: { description: "Liveness check itself failed", ...livenessResponse },
    503: { description: "Database is unreachable", ...livenessResponse },
  },
});
