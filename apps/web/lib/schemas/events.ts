/**
 * Zod schemas for Event API endpoints.
 *
 * These schemas validate request parameters and responses, while also
 * generating OpenAPI documentation automatically.
 *
 * @module
 * @category Schemas
 */
import {
  BoundsParamSchema,
  CatalogParamSchema,
  DatasetsParamSchema,
  DateParamSchema,
  PaginationSchema,
  z,
} from "./common";

/**
 * Base event filter parameters shared across endpoints.
 */
export const EventFiltersSchema = z.object({
  catalog: CatalogParamSchema,
  datasets: DatasetsParamSchema.optional(),
  startDate: DateParamSchema,
  endDate: DateParamSchema,
  bounds: BoundsParamSchema,
});

export type EventFilters = z.infer<typeof EventFiltersSchema>;

// =============================================================================
// Event List Endpoint
// =============================================================================

/**
 * Query parameters for GET /api/events/list
 */
export const EventListQuerySchema = EventFiltersSchema.merge(PaginationSchema)
  .extend({
    sort: z.string().default("-eventTimestamp"),
  })
  .openapi("EventListQuery");

export type EventListQuery = z.infer<typeof EventListQuerySchema>;

/**
 * Single event in list response.
 */
export const EventItemSchema = z
  .object({
    id: z.number(),
    dataset: z.object({
      id: z.number(),
      title: z.string().optional(),
      catalog: z.string().optional(),
    }),
    data: z.record(z.string(), z.unknown()),
    location: z
      .object({
        longitude: z.number(),
        latitude: z.number(),
      })
      .nullable(),
    eventTimestamp: z.string(),
    isValid: z.boolean(),
  })
  .openapi("EventItem");

/**
 * Response for GET /api/events/list
 */
export const EventListResponseSchema = z
  .object({
    events: z.array(EventItemSchema),
    pagination: z.object({
      page: z.number(),
      limit: z.number(),
      totalDocs: z.number(),
      totalPages: z.number(),
      hasNextPage: z.boolean(),
      hasPrevPage: z.boolean(),
      nextPage: z.number().nullable(),
      prevPage: z.number().nullable(),
    }),
  })
  .openapi("EventListResponse");

export type EventListResponse = z.infer<typeof EventListResponseSchema>;

// =============================================================================
// Aggregate Endpoint
// =============================================================================

/**
 * Query parameters for GET /api/events/aggregate
 */
export const AggregateQuerySchema = EventFiltersSchema.extend({
  groupBy: z.enum(["catalog", "dataset"]),
}).openapi("AggregateQuery");

export type AggregateQuery = z.infer<typeof AggregateQuerySchema>;

/**
 * Single item in aggregation response.
 */
export const AggregationItemSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    name: z.string(),
    count: z.number().int(),
  })
  .openapi("AggregationItem");

/**
 * Response for GET /api/events/aggregate
 */
export const AggregateResponseSchema = z
  .object({
    items: z.array(AggregationItemSchema),
    total: z.number().int(),
    groupedBy: z.string(),
  })
  .openapi("AggregateResponse");

export type AggregateResponse = z.infer<typeof AggregateResponseSchema>;

// =============================================================================
// Histogram Endpoint
// =============================================================================

/**
 * Query parameters for GET /api/events/histogram
 */
export const HistogramQuerySchema = EventFiltersSchema.extend({
  targetBuckets: z.coerce.number().int().default(30),
  minBuckets: z.coerce.number().int().default(20),
  maxBuckets: z.coerce.number().int().default(50),
}).openapi("HistogramQuery");

export type HistogramQuery = z.infer<typeof HistogramQuerySchema>;

/**
 * Single bucket in histogram response.
 */
export const HistogramBucketSchema = z
  .object({
    date: z.string().describe("Bucket start timestamp (ISO 8601)"),
    dateEnd: z.string().describe("Bucket end timestamp (ISO 8601)"),
    count: z.number().int(),
  })
  .openapi("HistogramBucket");

/**
 * Response for GET /api/events/histogram
 */
export const HistogramResponseSchema = z
  .object({
    histogram: z.array(HistogramBucketSchema),
    metadata: z.object({
      total: z.number().int(),
      dateRange: z.object({
        min: z.string().nullable(),
        max: z.string().nullable(),
      }),
      bucketSizeSeconds: z.number().nullable(),
      bucketCount: z.number().int(),
      counts: z.object({
        datasets: z.number().int(),
        catalogs: z.number().int(),
      }),
      topDatasets: z.array(z.unknown()),
      topCatalogs: z.array(z.unknown()),
    }),
  })
  .openapi("HistogramResponse");

export type HistogramResponse = z.infer<typeof HistogramResponseSchema>;

// =============================================================================
// Map Clusters Endpoint
// =============================================================================

/**
 * Query parameters for GET /api/events/map-clusters
 */
export const MapClustersQuerySchema = EventFiltersSchema.extend({
  bounds: z.string().describe("Required JSON bounding box"),
  zoom: z.coerce.number().int().default(10),
}).openapi("MapClustersQuery");

export type MapClustersQuery = z.infer<typeof MapClustersQuerySchema>;

/**
 * GeoJSON Feature for a cluster or single event.
 */
export const ClusterFeatureSchema = z
  .object({
    type: z.literal("Feature"),
    id: z.union([z.number(), z.string()]),
    geometry: z.object({
      type: z.literal("Point"),
      coordinates: z.tuple([z.number(), z.number()]),
    }),
    properties: z.object({
      type: z.enum(["event-cluster", "event-point"]),
      count: z.number().int().optional(),
      title: z.string().optional(),
    }),
  })
  .openapi("ClusterFeature");

/**
 * Response for GET /api/events/map-clusters
 */
export const MapClustersResponseSchema = z
  .object({
    type: z.literal("FeatureCollection"),
    features: z.array(ClusterFeatureSchema),
  })
  .openapi("MapClustersResponse");

export type MapClustersResponse = z.infer<typeof MapClustersResponseSchema>;

// =============================================================================
// Cluster Stats Endpoint
// =============================================================================

/**
 * Query parameters for GET /api/events/cluster-stats
 */
export const ClusterStatsQuerySchema = EventFiltersSchema.openapi("ClusterStatsQuery");

export type ClusterStatsQuery = z.infer<typeof ClusterStatsQuerySchema>;

/**
 * Response for GET /api/events/cluster-stats
 */
export const ClusterStatsResponseSchema = z
  .object({
    p20: z.number(),
    p40: z.number(),
    p60: z.number(),
    p80: z.number(),
    p100: z.number(),
  })
  .openapi("ClusterStatsResponse");

export type ClusterStatsResponse = z.infer<typeof ClusterStatsResponseSchema>;
