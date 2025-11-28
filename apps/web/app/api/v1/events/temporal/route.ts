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
 * @module
 */
import { sql } from "@payloadcms/db-postgres";
import { NextResponse } from "next/server";
import { getPayload } from "payload";

import type { MapBounds } from "@/lib/geospatial";
import { parseBoundsParameter } from "@/lib/geospatial";
import { logError } from "@/lib/logger";
import { type AuthenticatedRequest, withOptionalAuth } from "@/lib/middleware/auth";
import { getAllAccessibleCatalogIds } from "@/lib/services/access-control";
import { internalError } from "@/lib/utils/api-response";
import { buildEventFilters } from "@/lib/utils/event-filters";
import { extractHistogramParameters, type HistogramParameters } from "@/lib/utils/event-params";
import config from "@/payload.config";

export const GET = withOptionalAuth(async (request: AuthenticatedRequest, _context: unknown): Promise<NextResponse> => {
  try {
    const payload = await getPayload({ config });

    const parameters = extractHistogramParameters(request.nextUrl.searchParams);
    const boundsResult = parseBoundsParameter(parameters.boundsParam);
    if (boundsResult.error) {
      return boundsResult.error;
    }
    const bounds = boundsResult.bounds;

    // Get accessible catalog IDs for this user
    const accessibleCatalogIds = await getAllAccessibleCatalogIds(payload, request.user);

    const filters = buildEventFilters({
      parameters,
      accessibleCatalogIds,
      bounds,
    });

    // If user doesn't have access to the requested catalog, return empty result
    if (filters.denyAccess) {
      return NextResponse.json(buildEmptyHistogramResponse());
    }

    const histogramResult = await executeHistogramQuery(payload, parameters, bounds, accessibleCatalogIds);
    const response = buildHistogramResponse(histogramResult.rows);

    return NextResponse.json(response);
  } catch (_error) {
    logError(_error, "Failed to calculate histogram", { parameters: _error });
    return internalError("Failed to calculate histogram");
  }
});

const executeHistogramQuery = async (
  payload: Awaited<ReturnType<typeof getPayload>>,
  parameters: HistogramParameters,
  bounds: MapBounds | null,
  accessibleCatalogIds: number[]
) => {
  const filters = buildEventFilters({
    parameters,
    accessibleCatalogIds,
    bounds,
  });

  return (await payload.db.drizzle.execute(sql`
    SELECT * FROM calculate_event_histogram(
      ${JSON.stringify(filters)}::jsonb,
      ${parameters.targetBuckets}::integer,
      ${parameters.minBuckets}::integer,
      ${parameters.maxBuckets}::integer
    )
  `)) as {
    rows: Array<{
      bucket_start: string;
      bucket_end: string;
      bucket_size_seconds: number;
      event_count: number;
    }>;
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
  rows: Array<{
    bucket_start: string;
    bucket_end: string;
    bucket_size_seconds: number;
    event_count: number;
  }>
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
      dateRange: {
        min: rows[0]?.bucket_start ?? null,
        max: rows[rows.length - 1]?.bucket_end ?? null,
      },
      bucketSizeSeconds: rows[0]?.bucket_size_seconds ?? null,
      bucketCount: rows.length,
      counts: { datasets: 0, catalogs: 0 },
      topDatasets: [],
      topCatalogs: [],
    },
  };
};
