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
 * query API for performance. Access control is enforced via `resolveEventQueryContext()`
 * which filters by catalog visibility and user ownership, ensuring equivalent
 * security to Payload's built-in access control.
 *
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import { apiRoute } from "@/lib/api";
import type { CanonicalEventFilters } from "@/lib/filters/canonical-event-filters";
import { toHistogramJsonb } from "@/lib/filters/to-jsonb-payload";
import type { HistogramQuery } from "@/lib/schemas/events";
import { HistogramQuerySchema } from "@/lib/schemas/events";
import { resolveEventQueryContext } from "@/lib/services/resolve-event-query-context";

export const GET = apiRoute({
  auth: "optional",
  query: HistogramQuerySchema,
  handler: async ({ query, user, payload }) => {
    const ctx = await resolveEventQueryContext({ payload, user, query });
    if (ctx.denied) {
      return buildEmptyHistogramResponse();
    }

    const histogramResult = await executeHistogramQuery(payload, query, ctx.filters);
    return buildHistogramResponse(histogramResult.rows);
  },
});

const executeHistogramQuery = async (payload: Payload, query: HistogramQuery, filters: CanonicalEventFilters) => {
  // The SQL function caps bucket count to maxBuckets first, then unconditionally
  // enforces minBuckets afterwards. If a caller supplies minBuckets > maxBuckets the
  // min clamp would override the max cap and return more buckets than requested.
  // Clamp minBuckets so the max cap always wins.
  const maxBuckets = query.maxBuckets;
  const minBuckets = Math.min(query.minBuckets, maxBuckets);

  return (await payload.db.drizzle.execute(sql`
    SELECT * FROM calculate_event_histogram(
      ${toHistogramJsonb(filters)}::jsonb,
      ${query.targetBuckets}::integer,
      ${minBuckets}::integer,
      ${maxBuckets}::integer
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
  const total = rows.reduce((sum: number, row) => sum + Number.parseInt(String(row.event_count), 10), 0);

  const histogram = rows
    .filter((row) => {
      const start = new Date(row.bucket_start);
      const end = new Date(row.bucket_end);
      return !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime());
    })
    .map((row) => ({
      date: new Date(row.bucket_start).toISOString(),
      dateEnd: new Date(row.bucket_end).toISOString(),
      count: Number.parseInt(String(row.event_count), 10),
    }));

  return {
    histogram,
    metadata: {
      total,
      dateRange: { min: rows[0]?.bucket_start ?? null, max: rows.at(-1)?.bucket_end ?? null },
      bucketSizeSeconds: rows[0]?.bucket_size_seconds ?? null,
      bucketCount: rows.length,
      counts: { datasets: 0, catalogs: 0 },
      topDatasets: [],
      topCatalogs: [],
    },
  };
};
