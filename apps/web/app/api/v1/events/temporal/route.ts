/**
 * This file defines the API route for generating a temporal histogram of events.
 *
 * It accepts a set of filters (such as catalog, datasets, date range, and geographic bounds)
 * and uses a custom PostgreSQL function (`calculate_event_histogram`) to efficiently
 * aggregate event counts with flexible bucket sizing. Users can specify a target bucket count
 * range (min/max), and the function automatically calculates the optimal bucket size.
 *
 * This is used to power the date histogram chart in the application, providing a
 * performance-optimized way to visualize the distribution of events over time.
 *
 * **Architecture note:** Uses raw SQL with PostGIS functions instead of Payload's
 * query API for performance. Access control is enforced via `getAllAccessibleCatalogIds()`
 * which filters by catalog visibility and user ownership, ensuring equivalent
 * security to Payload's built-in access control.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { apiRoute } from "@/lib/api";
import type { HistogramQuery } from "@/lib/schemas/events";
import { HistogramQuerySchema } from "@/lib/schemas/events";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import { buildEventFilters, type EventFilters } from "@/lib/utils/event-filters";

export const GET = apiRoute({
  auth: "optional",
  query: HistogramQuerySchema,
  handler: async ({ query, user, payload }) => {
    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, user);

    const filters = buildEventFilters({ parameters: query, accessibleCatalogIds });

    // If user doesn't have access to the requested catalog, return empty result
    if (filters.denyAccess === true || filters.denyResults === true) {
      return Response.json(buildEmptyHistogramResponse());
    }

    const histogramResult = await executeHistogramQuery(payload, query, filters, accessibleCatalogIds);
    const response = buildHistogramResponse(histogramResult.rows);

    return Response.json(response);
  },
});

const executeHistogramQuery = async (
  payload: Payload,
  query: HistogramQuery,
  _filters: EventFilters,
  accessibleCatalogIds: number[]
) => {
  // Rebuild filters for the SQL function (needs fresh conversion)
  const filters = buildEventFilters({ parameters: query, accessibleCatalogIds });

  return (await payload.db.drizzle.execute(sql`
    SELECT * FROM calculate_event_histogram(
      ${JSON.stringify(filters)}::jsonb,
      ${query.targetBuckets}::integer,
      ${query.minBuckets}::integer,
      ${query.maxBuckets}::integer
    )
  `)) as {
    rows: Array<{ bucket_start: string; bucket_end: string; bucket_size_seconds: number; event_count: number }>;
  };
};

const buildEmptyHistogramResponse = () => ({
  histogram: [],
  metadata: {
    total: 0,
    dateRange: { min: null, max: null },
    bucketSizeSeconds: null,
    bucketCount: 0,
    counts: { datasets: 0, catalogs: 0 },
    topDatasets: [],
    topCatalogs: [],
  },
});

const buildHistogramResponse = (
  rows: Array<{ bucket_start: string; bucket_end: string; bucket_size_seconds: number; event_count: number }>
) => {
  const total = rows.reduce((sum: number, row) => sum + parseInt(String(row.event_count), 10), 0);

  const histogram = rows.map((row) => ({
    date: new Date(row.bucket_start).toISOString(), // Bucket start as ISO 8601
    dateEnd: new Date(row.bucket_end).toISOString(), // Bucket end as ISO 8601
    count: parseInt(String(row.event_count), 10),
  }));

  return {
    histogram,
    metadata: {
      total,
      dateRange: { min: rows[0]?.bucket_start ?? null, max: rows[rows.length - 1]?.bucket_end ?? null },
      bucketSizeSeconds: rows[0]?.bucket_size_seconds ?? null,
      bucketCount: rows.length,
      counts: { datasets: 0, catalogs: 0 },
      topDatasets: [],
      topCatalogs: [],
    },
  };
};
