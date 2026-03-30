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
  FieldFiltersParamSchema,
  PaginationSchema,
  ScopeIdsParamSchema,
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
  ff: FieldFiltersParamSchema,
  scopeCatalogs: ScopeIdsParamSchema.optional(),
  scopeDatasets: ScopeIdsParamSchema.optional(),
  /** H3 cell IDs for precise spatial filtering (comma-separated) */
  clusterCells: z.string().optional(),
  /** H3 resolution for clusterCells (2-15) */
  h3Resolution: z.coerce.number().int().min(2).max(15).optional(),
});

export type EventFilters = z.infer<typeof EventFiltersSchema>;

// =============================================================================
// Event List Endpoint
// =============================================================================

/**
 * Query parameters for GET /api/events/list
 */
export const EventListQuerySchema = EventFiltersSchema.extend({
  ...PaginationSchema.shape,
  sort: z.string().default("-eventTimestamp"),
}).openapi("EventListQuery");

export type EventListQuery = z.infer<typeof EventListQuerySchema>;

/**
 * Single event in list response.
 */
export const EventItemSchema = z
  .object({
    id: z.number(),
    dataset: z.object({ id: z.number(), name: z.string().optional(), catalog: z.string().optional() }),
    data: z.record(z.string(), z.unknown()),
    location: z.object({ longitude: z.number(), latitude: z.number() }).nullable(),
    locationName: z.string().nullable().optional(),
    geocodedAddress: z.string().nullable().optional(),
    eventTimestamp: z.string(),
    eventEndTimestamp: z.string().nullable().optional(),
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

/** Single event item as returned by the list API (trimmed DTO, not the full Payload Event). */
export type EventListItem = z.infer<typeof EventItemSchema>;

// =============================================================================
// Aggregate Endpoint
// =============================================================================

/**
 * Query parameters for GET /api/events/aggregate
 */
export const AggregateQuerySchema = EventFiltersSchema.extend({ groupBy: z.enum(["catalog", "dataset"]) }).openapi(
  "AggregateQuery"
);

export type AggregateQuery = z.infer<typeof AggregateQuerySchema>;

/**
 * Single item in aggregation response.
 */
export const AggregationItemSchema = z
  .object({ id: z.union([z.number(), z.string()]), name: z.string(), count: z.number().int() })
  .openapi("AggregationItem");

export type AggregationItem = z.infer<typeof AggregationItemSchema>;

/**
 * Response for GET /api/events/aggregate
 */
export const AggregateResponseSchema = z
  .object({ items: z.array(AggregationItemSchema), total: z.number().int(), groupedBy: z.string() })
  .openapi("AggregateResponse");

export type AggregateResponse = z.infer<typeof AggregateResponseSchema>;

// =============================================================================
// Histogram Endpoint
// =============================================================================

/**
 * Query parameters for GET /api/events/histogram
 */
export const HistogramQuerySchema = EventFiltersSchema.extend({
  targetBuckets: z.coerce.number().int().min(1).max(500).default(30),
  minBuckets: z.coerce.number().int().min(1).max(500).default(20),
  maxBuckets: z.coerce.number().int().min(1).max(500).default(50),
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

export type HistogramBucket = z.infer<typeof HistogramBucketSchema>;

/**
 * Response for GET /api/events/histogram
 */
export const HistogramResponseSchema = z
  .object({
    histogram: z.array(HistogramBucketSchema),
    metadata: z.object({
      total: z.number().int(),
      dateRange: z.object({ min: z.string().nullable(), max: z.string().nullable() }),
      bucketSizeSeconds: z.number().nullable(),
      bucketCount: z.number().int(),
      counts: z.object({ datasets: z.number().int(), catalogs: z.number().int() }),
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
export const ClusterAlgorithmSchema = z.enum(["h3", "grid-k", "dbscan"]).default("h3");
export type ClusterAlgorithm = z.infer<typeof ClusterAlgorithmSchema>;

export const MapClustersQuerySchema = EventFiltersSchema.extend({
  zoom: z.coerce.number().int().min(0).max(28).default(10),
  targetClusters: z.coerce.number().int().min(5).max(500).default(25).optional(),
  clusterAlgorithm: ClusterAlgorithmSchema.optional(),
  minPoints: z.coerce.number().int().min(2).max(20).default(2).optional(),
  mergeOverlapping: z
    .preprocess((v) => v === "true" || v === true, z.boolean())
    .default(true)
    .optional(),
  h3ResolutionScale: z.coerce.number().min(0.3).max(1.2).default(0.6).optional(),
  useHexCenter: z
    .preprocess((v) => v === "true" || v === true, z.boolean())
    .default(false)
    .optional(),
  parentCells: z.string().optional(),
}).openapi("MapClustersQuery");

export type MapClustersQuery = z.infer<typeof MapClustersQuerySchema>;

/**
 * GeoJSON Feature for a cluster or unique location.
 *
 * - `event-cluster`: zoom-dependent grouping of nearby locations
 * - `event-location`: zoom-independent grouping of co-located events (H3 r15 cell)
 */
export const ClusterFeatureSchema = z
  .object({
    type: z.literal("Feature"),
    id: z.union([z.number(), z.string()]),
    geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }),
    properties: z.object({
      type: z.enum(["event-cluster", "event-location"]),
      count: z.number().int().optional(),
      clusterId: z.string().optional(),
      title: z.string().optional(),
      sourceCells: z.array(z.string()).optional(),
      h3Cell: z.string().optional(),
      eventId: z.number().int().optional(),
      locationName: z.string().optional(),
      locationCount: z.number().int().optional(),
    }),
  })
  .openapi("ClusterFeature");

/**
 * Response for GET /api/events/map-clusters
 */
export const MapClustersResponseSchema = z
  .object({ type: z.literal("FeatureCollection"), features: z.array(ClusterFeatureSchema) })
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
  .object({ p20: z.number(), p40: z.number(), p60: z.number(), p80: z.number(), p100: z.number() })
  .openapi("ClusterStatsResponse");

export type ClusterStatsResponse = z.infer<typeof ClusterStatsResponseSchema>;

// =============================================================================
// Cluster Summary Endpoint
// =============================================================================

/** Query parameters for GET /api/v1/events/cluster-summary */
export const ClusterSummaryQuerySchema = EventFiltersSchema.extend({
  cells: z.string().min(1),
  h3Resolution: z.coerce.number().int().min(2).max(15),
}).openapi("ClusterSummaryQuery");

export type ClusterSummaryQuery = z.infer<typeof ClusterSummaryQuerySchema>;

/** Response for GET /api/v1/events/cluster-summary */
export type ClusterSummaryResponse = {
  totalCount: number;
  locationCount: number;
  temporalRange: { earliest: string; latest: string } | null;
  datasets: Array<{ id: number; name: string; count: number }>;
  catalogs: Array<{ id: number; name: string; count: number }>;
  categories: Array<{ field: string; values: Array<{ value: string; count: number }> }>;
  preview: Array<{ id: number; title?: string; timestamp?: string; datasetName: string }>;
};

// =============================================================================
// Temporal Clusters Endpoint
// =============================================================================

/**
 * Query parameters for GET /api/v1/events/temporal-clusters
 */
export const TemporalClustersQuerySchema = EventFiltersSchema.extend({
  targetBuckets: z.coerce.number().int().min(1).max(200).default(40),
  individualThreshold: z.coerce.number().int().min(0).max(2000).default(500),
  groupBy: z.string().max(64).default("dataset"),
}).openapi("TemporalClustersQuery");

export type TemporalClustersQuery = z.infer<typeof TemporalClustersQuerySchema>;

/**
 * Single item in temporal clusters response (either individual event or cluster).
 */
export const TemporalClusterItemSchema = z
  .object({
    bucketStart: z.string(),
    bucketEnd: z.string(),
    groupId: z.string(),
    groupName: z.string(),
    count: z.number().int(),
    eventId: z.number().int().optional(),
    eventTitle: z.string().nullable().optional(),
    eventTimestamp: z.string().optional(),
  })
  .openapi("TemporalClusterItem");

export type TemporalClusterItem = z.infer<typeof TemporalClusterItemSchema>;

/**
 * Response for GET /api/v1/events/temporal-clusters
 */
export const TemporalClustersResponseSchema = z
  .object({
    items: z.array(TemporalClusterItemSchema),
    metadata: z.object({
      total: z.number().int(),
      mode: z.enum(["individual", "clustered"]),
      groupBy: z.string(),
      bucketSizeSeconds: z.number().nullable(),
      bucketCount: z.number().int(),
      dateRange: z.object({ min: z.string().nullable(), max: z.string().nullable() }),
    }),
  })
  .openapi("TemporalClustersResponse");

export type TemporalClustersResponse = z.infer<typeof TemporalClustersResponseSchema>;
